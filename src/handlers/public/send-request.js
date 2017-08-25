'use strict'

const base64url = require('base64url')
const request = require('superagent')
const IlpPacket = require('ilp-packet')

const MIN_MESSAGE_WINDOW = 1000
const RATE_EXPIRY_DURATION = 360000

module.exports = ({ prefix, peerAccount, routingTable }) => async (message) => {
  // respond to route broadcasts so we don't look like we're down
  if (message.custom && message.custom.method === 'broadcast_routes') {
    return {
      to: peerAccount,
      ledger: prefix
    }
  }

  const packetBuffer = Buffer.from(message.ilp, 'base64')
  const { type, data } = IlpPacket.deserializeIlpPacket(packetBuffer)
  // TODO: This could break for non-ILQP message types
  const { destinationAccount, destinationHoldDuration } = data
  const nextHop = routingTable.getNextHop(destinationAccount)
  const sourceHoldDuration = destinationHoldDuration + MIN_MESSAGE_WINDOW

  if (nextHop.local) {
    let responsePacket
    if (type === IlpPacket.Type.TYPE_ILQP_BY_SOURCE_REQUEST) {
      // Apply our rate to the source amount
      const { sourceAmount } = data

      const destinationAmount = nextHop.curveLocal.amountAt(sourceAmount).toString()
      responsePacket = IlpPacket.serializeIlqpBySourceResponse({
        destinationAmount,
        sourceHoldDuration
      })
    } else if (type === IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_REQUEST) {
      // Apply our rate to the destination amount (because it's local)
      const { destinationAmount } = data

      // Add one (1) to basically round up
      const sourceAmount = nextHop.curveLocal.amountReverse(destinationAmount).plus(1).toString()
      responsePacket = IlpPacket.serializeIlqpByDestinationResponse({
        sourceAmount,
        sourceHoldDuration
      })
    } else if (type === IlpPacket.Type.TYPE_ILQP_LIQUIDITY_REQUEST) {
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
    if (type === IlpPacket.Type.TYPE_ILQP_BY_SOURCE_REQUEST) {
      const { sourceAmount } = data
      const nextAmount = nextHop.curveLocal.amountAt(sourceAmount).toString()
      nextIlpPacket = IlpPacket.serializeIlqpBySourceRequest({
        destinationAccount,
        sourceAmount: nextAmount,
        destinationHoldDuration
      })
    } else {
      // If it's a fixed destination amount or liquidity quote we'll apply our rate to the response
      nextIlpPacket = message.ilp
    }

    // Remote quote
    const res = await request.post(nextHop.shard + '/internal/request')
      .send({ ilp: nextIlpPacket })

    if (type === IlpPacket.Type.TYPE_ILQP_BY_SOURCE_REQUEST) {
      return {
        to: peerAccount,
        ledger: prefix,
        ilp: res.body.ilp
      }
    } else {
      const { type, data } = IlpPacket.deserializeIlpPacket(Buffer.from(res.body.ilp, 'base64'))

      const sourceHoldDuration = data.sourceHoldDuration + MIN_MESSAGE_WINDOW

      let responsePacket
      if (type === IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_RESPONSE) {
        const sourceAmount = nextHop.curveLocal.amountReverse(data.sourceAmount).plus(1).toString()
        responsePacket = IlpPacket.serializeIlqpByDestinationResponse({
          sourceAmount,
          sourceHoldDuration
        })
      } else if (type === IlpPacket.Type.TYPE_ILQP_LIQUIDITY_RESPONSE) {
        const combinedCurve = nextHop.curveLocal.join(data.liquidityCurve)
        responsePacket = IlpPacket.serializeIlqpLiquidityResponse({
          liquidityCurve: combinedCurve.toBuffer(),
          appliesToPrefix: nextHop.prefix,
          sourceHoldDuration,
          expiresAt: new Date(Math.min(data.expiresAt, Date.now() + RATE_EXPIRY_DURATION))
        })
      } else {
        throw new Error('Unknown request type')
      }

      return {
        to: peerAccount,
        ledger: prefix,
        ilp: base64url(responsePacket)
      }
    }
  }
}
