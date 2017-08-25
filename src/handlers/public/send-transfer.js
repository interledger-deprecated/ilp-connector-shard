'use strict'

const IlpPacket = require('ilp-packet')
const request = require('superagent')
const BigNumber = require('bignumber.js')
const { getDeterministicUuid } = require('../../util/uuid')

const MIN_MESSAGE_WINDOW = 1000

module.exports = ({ plugin, prefix, routingTable, internalUri, uuidSecret }) => async (transfer) => {
  const packetBuffer = Buffer.from(transfer.ilp, 'base64')
  const { type, data } = IlpPacket.deserializeIlpPacket(packetBuffer)

  if (type !== IlpPacket.Type.TYPE_ILP_PAYMENT) {
    throw new Error('Unsupported ILP packet type: ' + type)
  }

  const nextHop = routingTable.getNextHop(data.account)
  let nextAmount = nextHop.curveLocal.amountAt(transfer.amount)
  if (nextHop.local) {
    const finalAmount = new BigNumber(data.amount)
    if (nextAmount.lessThan(data.amount)) {
      throw new Error('Insufficient incoming liquidity')
    } else {
      nextAmount = finalAmount
    }
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
