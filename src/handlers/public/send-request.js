'use strict'

const base64url = require('base64url')
const request = require('superagent')
const IlpPacket = require('ilp-packet')
const { LiquidityCurve } = require('ilp-routing')

const MIN_MESSAGE_WINDOW = 1000
const RATE_EXPIRY_DURATION = 360000

module.exports = ({ prefix, peerAccount, routeManagerUri, routingTable, ilpErrors }) => async (message) => {
  // respond to route broadcasts so we don't look like we're down
  if (message.custom && message.custom.method === 'broadcast_routes') {
    if (routeManagerUri) {
      await request.post(routeManagerUri + '/internal/request').send(message)
    }
    return {
      to: peerAccount,
      ledger: prefix
    }
  }

  const packetBuffer = Buffer.from(message.ilp, 'base64')
  const req = IlpPacket.deserializeIlpPacket(packetBuffer)
  // TODO: This could break for non-ILQP message types
  const { destinationAccount, destinationHoldDuration } = req.data
  const nextHop = routingTable.getNextHop(destinationAccount)
  const sourceHoldDuration = destinationHoldDuration + MIN_MESSAGE_WINDOW

  if (!nextHop) {
    const responsePacket = IlpPacket.serializeIlpRejection(ilpErrors.F02_Unreachable('No route found to ' + destinationAccount))
    return {
      to: peerAccount,
      ledger: prefix,
      ilp: base64url(responsePacket)
    }
  } else if (nextHop.local) {
    let responsePacket
    if (req.type === IlpPacket.Type.TYPE_ILQP_BY_SOURCE_REQUEST) {
      // Apply our rate to the source amount
      const { sourceAmount } = req.data

      const destinationAmount = nextHop.curveLocal.amountAt(sourceAmount).toString()
      responsePacket = IlpPacket.serializeIlqpBySourceResponse({
        destinationAmount,
        sourceHoldDuration
      })
    } else if (req.type === IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_REQUEST) {
      // Apply our rate to the destination amount (because it's local)
      const { destinationAmount } = req.data

      // Add one (1) to basically round up
      const sourceAmount = nextHop.curveLocal.amountReverse(destinationAmount).plus(1).toString()
      responsePacket = IlpPacket.serializeIlqpByDestinationResponse({
        sourceAmount,
        sourceHoldDuration
      })
    } else if (req.type === IlpPacket.Type.TYPE_ILQP_LIQUIDITY_REQUEST) {
      responsePacket = IlpPacket.serializeIlqpLiquidityResponse({
        liquidityCurve: nextHop.curveLocal.toBuffer(),
        appliesToPrefix: nextHop.prefix,
        sourceHoldDuration,
        expiresAt: new Date(Date.now() + RATE_EXPIRY_DURATION)
      })
    }

    // Respond with local quote
    return {
      to: peerAccount,
      ledger: prefix,
      ilp: base64url(responsePacket)
    }
  } else {
    // Remote quotes

    // When remote quoting by source amount we need to adjust
    // the amount we ask our peer for by our rate
    let nextIlpPacket
    if (req.type === IlpPacket.Type.TYPE_ILQP_BY_SOURCE_REQUEST) {
      const { sourceAmount } = req.data
      const nextAmount = nextHop.curveLocal.amountAt(sourceAmount).toString()
      nextIlpPacket = IlpPacket.serializeIlqpBySourceRequest({
        destinationAccount,
        sourceAmount: nextAmount,
        destinationHoldDuration
      })
    } else {
      // If it's a fixed destination amount or liquidity quote we'll apply our rate to the response
      nextIlpPacket = packetBuffer
    }

    // Remote quote
    const httpRes = await request.post(nextHop.shard + '/internal/request')
      .send({ ilp: base64url(nextIlpPacket) })
    const res = IlpPacket.deserializeIlpPacket(Buffer.from(httpRes.body.ilp, 'base64'))
    const sourceHoldDuration = res.data.sourceHoldDuration + MIN_MESSAGE_WINDOW

    let responsePacket
    if (res.type === IlpPacket.Type.TYPE_ILP_ERROR) {
      responsePacket = IlpPacket.serializeIlpError(ilpErrors.forward(res.data))
    } else if (res.type === IlpPacket.Type.TYPE_ILP_REJECTION) {
      responsePacket = IlpPacket.serializeIlpRejection(res.data)
    } else if (req.type + 1 !== res.type) {
      responsePacket = IlpPacket.serializeIlpRejection(ilpErrors.F01_Invalid_Packet('Received incorrect response type'))
    } else if (res.type === IlpPacket.Type.TYPE_ILQP_BY_SOURCE_RESPONSE) {
      responsePacket = IlpPacket.serializeIlqpBySourceResponse({
        destinationAmount: res.data.destinationAmount,
        sourceHoldDuration
      })
    } else if (res.type === IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_RESPONSE) {
      const sourceAmount = nextHop.curveLocal.amountReverse(res.data.sourceAmount).plus(1).toString()
      responsePacket = IlpPacket.serializeIlqpByDestinationResponse({
        sourceAmount,
        sourceHoldDuration
      })
    } else if (res.type === IlpPacket.Type.TYPE_ILQP_LIQUIDITY_RESPONSE) {
      const combinedCurve = nextHop.curveLocal.join(new LiquidityCurve(res.data.liquidityCurve))
      responsePacket = IlpPacket.serializeIlqpLiquidityResponse({
        liquidityCurve: combinedCurve.toBuffer(),
        appliesToPrefix: longer(nextHop.prefix, res.data.appliesToPrefix),
        sourceHoldDuration,
        expiresAt: new Date(Math.min(res.data.expiresAt, Date.now() + RATE_EXPIRY_DURATION))
      })
    } else {
      throw new Error('Unknown response type')
    }

    return {
      to: peerAccount,
      ledger: prefix,
      ilp: base64url(responsePacket)
    }
  }
}

function longer (str1, str2) {
  return str1.length > str2.length ? str1 : str2
}
