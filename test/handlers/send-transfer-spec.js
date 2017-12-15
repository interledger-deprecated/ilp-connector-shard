'use strict'
/* eslint-env mocha */

const assert = require('assert')
const nock = require('nock')
const IlpPacket = require('ilp-packet')
const { LiquidityCurve } = require('ilp-routing')
const base64url = require('base64url')
const sendTransfer = require('../../src/handlers/public/send-transfer')
const RoutingTable = require('../../src/lib/routing-table')
const CurveCache = require('../../src/lib/curve-cache')

class MockPlugin {
  constructor () {
    this.rejections = []
  }

  async rejectIncomingTransfer (transferId, rejectionMessage) {
    this.rejections.push({transferId, rejectionMessage})
  }
}

describe('Send Transfer (public)', function () {
  beforeEach(function () {
    this.prefixWest = 'g.usd.connie.west.'
    this.prefixEast = 'g.eur.connie.east.'
    this.plugin = new MockPlugin()
    this.config = {
      plugin: this.plugin,
      account: 'g.usd.connie.west.server',
      peerAccount: 'g.usd.connie.west.client',
      prefix: this.prefixWest,
      internalUri: 'http://connie-west:8081',
      uuidSecret: Buffer.from('VPwjMtwDChk71qlXnc3bAw==', 'base64'),
      routingTable: new RoutingTable({
        initialTable: [{
          prefix: this.prefixEast,
          shard: 'http://connie-east:8081',
          curveLocal: [[0, 0], [500, 1000]],
          local: true
        }]
      }),
      curveCache: new CurveCache()
    }
    this.config.ilpErrors = require('../../src/lib/ilp-errors')(this.config)
    this.sendTransfer = sendTransfer(this.config)

    this.defaultTransfer = {
      id: '5857d460-2a46-4545-8311-1539d99e78e8',
      amount: '51',
      ilp: base64url(IlpPacket.serializeIlpPayment({
        account: this.prefixEast + 'bob',
        amount: '100'
      })),
      executionCondition: 'ni:///sha-256;I3TZF5S3n0-07JWH0s8ArsxPmVP6s-0d0SqxR6C3Ifk?fpt=preimage-sha-256&cost=6',
      expiresAt: (new Date(this.START_DATE + 5000)).toISOString()
    }
  })

  before(function () {
    this.testSendTransfer = function (params) {
      return this.sendTransfer(Object.assign({}, this.defaultTransfer, params))
    }

    this.testSendTransferToShard = function (opts) {
      nock('http://connie-east:8081').post('/internal/transfer', {
        transfer: Object.assign({}, this.defaultTransfer, {
          id: 'd18892e4-a8f8-4417-8d24-fd87867d88e0',
          expiresAt: (new Date(this.START_DATE + 4000)).toISOString(),
          noteToSelf: {
            source: {
              uri: this.config.internalUri,
              id: this.defaultTransfer.id
            }
          }
        }, opts.nockTransfer)
      }).reply(204)
      return this.testSendTransfer(opts.sendTransfer)
    }
  })

  it('throws an error when the transfer doesn\'t have an ILP payment packet', function () {
    return this.testSendTransfer({
      ilp: base64url(IlpPacket.serializeIlqpBySourceRequest({
        destinationAccount: this.prefixEast + 'bob',
        sourceAmount: '100',
        destinationHoldDuration: 3000
      }))
    }).then(() => {
      assert(false)
    }).catch((err) => {
      assert.equal(err.message, 'Unsupported ILP packet type: 4')
    })
  })

  describe('with a local route', function () {
    it('rejects a transfer with insufficient incoming liquidity', function () {
      return this.testSendTransfer({ amount: '49' }).then(() => {
        assert.deepStrictEqual(this.plugin.rejections, [{
          transferId: this.defaultTransfer.id,
          rejectionMessage: {
            code: 'R01',
            message: 'Insufficient Source Amount: Insufficient incoming liquidity',
            triggeredBy: this.config.account,
            data: Buffer.from('')
          }
        }])
      })
    })

    it('posts to the next shard', function () {
      return this.testSendTransferToShard({
        nockTransfer: { amount: '100' },
        sendTransfer: {}
      })
    })

    it('forwards if the packet is a forwarded payment', function () {
      const pkt = base64url(IlpPacket.serializeIlpForwardedPayment({
        account: this.prefixEast + 'bob'
      }))
      return this.testSendTransferToShard({
        nockTransfer: { ilp: pkt, amount: '102' },
        sendTransfer: { ilp: pkt }
      })
    })
  })

  describe('with a remote route', function () {
    beforeEach(function () {
      this.prefixConrad = 'g.eur.conrad.'
      this.config.routingTable = new RoutingTable({
        initialTable: [{
          prefix: this.prefixConrad,
          shard: 'http://connie-east:8081',
          curveLocal: [[0, 0], [500, 1000]]
        }]
      })
      this.sendTransfer = sendTransfer(this.config)

      nock('http://connie-east:8081').post('/internal/request', {
        ilp: base64url(IlpPacket.serializeIlqpLiquidityRequest({
          destinationAccount: this.prefixConrad + 'south.bob',
          destinationHoldDuration: 10000
        }))
      }).reply(200, {
        ilp: base64url(IlpPacket.serializeIlqpLiquidityResponse({
          liquidityCurve: (new LiquidityCurve([[0, 0], [100, 300]])).toBuffer(),
          appliesToPrefix: this.prefixConrad,
          sourceHoldDuration: 9000,
          expiresAt: new Date(Date.now() + 10000)
        }))
      })
    })

    it('posts to the next shard', function () {
      return this.testSendTransferToShard({
        nockTransfer: {
          amount: '33',
          ilp: base64url(IlpPacket.serializeIlpPayment({
            account: this.prefixConrad + 'south.bob',
            amount: '100'
          }))
        },
        sendTransfer: {
          amount: '49',
          ilp: base64url(IlpPacket.serializeIlpPayment({
            account: this.prefixConrad + 'south.bob',
            amount: '100'
          }))
        }
      })
    })
  })
})
