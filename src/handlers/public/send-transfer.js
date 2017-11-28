'use strict'

const IlpPacket = require('ilp-packet')
const request = require('superagent')
const BigNumber = require('bignumber.js')
const { getDeterministicUuid } = require('../../util/uuid')

const MIN_MESSAGE_WINDOW = 1000

module.exports = ({ plugin, prefix, routingTable, internalUri, uuidSecret, ilpErrors }) => async (transfer) => {
  const packetBuffer = Buffer.from(transfer.ilp, 'base64')
  const { type, data } = IlpPacket.deserializeIlpPacket(packetBuffer)

  if (type !== IlpPacket.Type.TYPE_ILP_PAYMENT) {
    throw new Error('Unsupported ILP packet type: ' + type)
  }

  const nextHop = routingTable.getNextHop(data.account)
  const finalAmount = new BigNumber(data.amount)
  let nextAmount = nextHop.curveLocal.amountAt(transfer.amount)
  // Always forward when finalAmount is 0.
  if (nextHop.local && !finalAmount.equals(0)) {
    if (nextAmount.lessThan(data.amount)) {
      // TODO should this make an http request to a handler?
      await plugin.rejectIncomingTransfer(transfer.id,
        ilpErrors.R01_Insufficient_Source_Amount({
          message: 'Insufficient incoming liquidity'
        }))
      return
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
