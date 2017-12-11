'use strict'

const IlpPacket = require('ilp-packet')
const request = require('superagent')
const BigNumber = require('bignumber.js')
const { getDeterministicUuid } = require('../../util/uuid')

const MIN_MESSAGE_WINDOW = 1000

module.exports = ({ plugin, prefix, routingTable, curveCache, internalUri, uuidSecret, ilpErrors }) => async (transfer) => {
  const packetBuffer = Buffer.from(transfer.ilp, 'base64')
  const { type, data } = IlpPacket.deserializeIlpPacket(packetBuffer)

  let nextHop
  let nextAmount
  switch (type) {
    case IlpPacket.Type.TYPE_ILP_PAYMENT:
      nextHop = routingTable.getNextHop(data.account)
      if (nextHop.local) {
        nextAmount = data.amount
      } else {
        const curveRemote = await curveCache.get(nextHop.shard, data.account)
        nextAmount = curveRemote.amountReverse(data.amount)
      }
      const sourceAmount = new BigNumber(transfer.amount)

      if (sourceAmount.lessThan(nextHop.curveLocal.amountReverse(nextAmount))) {
        await plugin.rejectIncomingTransfer(transfer.id,
          ilpErrors.R01_Insufficient_Source_Amount({
            message: 'Insufficient incoming liquidity'
          }))

        return
      }
      break
    case IlpPacket.Type.TYPE_ILP_FORWARDED_PAYMENT:
      nextHop = routingTable.getNextHop(data.account)
      nextAmount = nextHop.curveLocal.amountAt(transfer.amount)
      break
    default:
      throw new Error('Unsupported ILP packet type: ' + type)
  }

  const nextExpiry = new Date(Date.parse(transfer.expiresAt) - MIN_MESSAGE_WINDOW).toISOString()
  await request.post(nextHop.shard + '/internal/transfer')
    .send({
      transfer: {
        id: getDeterministicUuid(uuidSecret, transfer.id),
        // ledger: nextHop.connectorLedger,
        // to: nextHop.connectorAccount,
        // from: prefix + 'client',
        amount: nextAmount.toString(),
        expiresAt: nextExpiry,
        executionCondition: transfer.executionCondition,
        ilp: transfer.ilp,
        noteToSelf: {
          source: {
            uri: internalUri,
            id: transfer.id
          }
        }
      }
    })
}
