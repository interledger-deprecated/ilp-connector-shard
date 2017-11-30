'use strict'
/* eslint-env mocha */

const assert = require('assert')
const nock = require('nock')
const IlpPacket = require('ilp-packet')
const base64url = require('base64url')
const { LiquidityCurve } = require('ilp-routing')
const sendRequest = require('../../src/handlers/public/send-request')
const RoutingTable = require('../../src/lib/routing-table')

describe('Send Request (public)', function () {
  beforeEach(function () {
    this.prefixWest = 'g.usd.connie.west.'
    this.prefixEast = 'g.eur.connie.east.'
    this.config = {
      account: 'g.usd.connie.west.server',
      peerAccount: 'g.usd.connie.west.client',
      prefix: this.prefixWest,
      routingTable: new RoutingTable({
        initialTable: [{
          prefix: this.prefixEast,
          shard: 'http://connie-east:8081',
          curveLocal: [[0, 0], [500, 1000]],
          curveRemote: [[0, 0], [1000, 500]],
          local: true
        }]
      })
    }
    this.config.ilpErrors = require('../../src/lib/ilp-errors')(this.config)
    this.sendRequest = sendRequest(this.config)
  })

  describe('broadcast_routes', function () {
    it('responds with a simple message', async function () {
      const res = await this.sendRequest({
        custom: {
          method: 'broadcast_routes',
          data: {
            new_routes: [],
            hold_down_time: 9999,
            unreachable_through_me: []
          }
        }
      })
      assert.deepStrictEqual(res, {
        to: this.config.peerAccount,
        ledger: this.prefixWest
      })
    })
  })

  describe('Quote', function () {
    before(function () {
      this.testQuote = async function (test) {
        const res = await this.sendRequest({ ilp: base64url(test.request) })
        assert.equal(res.to, this.config.peerAccount)
        assert.equal(res.ledger, this.prefixWest)
        assert.deepStrictEqual(IlpPacket.deserializeIlpPacket(Buffer.from(res.ilp, 'base64')).data, test.response)
      }

      this.testRemoteQuote = function (test) {
        nock('http://connie-east:8081')
          .post('/internal/request', { ilp: base64url(test.remoteRequest) })
          .reply(200, { ilp: base64url(test.remoteResponse) })
        return this.testQuote(test)
      }
    })

    it('returns an error when no matching route exists', function () {
      return this.testQuote({
        request: IlpPacket.serializeIlqpBySourceRequest({
          destinationAccount: 'g.usd.no-route.bob',
          sourceAmount: '100',
          destinationHoldDuration: 3000
        }),
        response: {
          code: 'F02',
          name: 'Unreachable',
          triggeredBy: this.config.account,
          forwardedBy: [],
          triggeredAt: new Date(this.START_DATE),
          data: ''
        }
      })
    })

    describe('with a local route', function () {
      it('by source', function () {
        return this.testQuote({
          request: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixEast + 'bob',
            sourceAmount: '100',
            destinationHoldDuration: 3000
          }),
          response: {
            destinationAmount: '200',
            sourceHoldDuration: 4000
          }
        })
      })

      it('by destination', function () {
        return this.testQuote({
          request: IlpPacket.serializeIlqpByDestinationRequest({
            destinationAccount: this.prefixEast + 'bob',
            destinationAmount: '200',
            destinationHoldDuration: 3000
          }),
          response: {
            sourceAmount: '101',
            sourceHoldDuration: 4000
          }
        })
      })

      it('by liquidity', function () {
        return this.testQuote({
          request: IlpPacket.serializeIlqpLiquidityRequest({
            destinationAccount: this.prefixEast + 'bob',
            destinationHoldDuration: 3000
          }),
          response: {
            liquidityCurve: (new LiquidityCurve([[0, 0], [500, 1000]])).toBuffer(),
            appliesToPrefix: this.prefixEast,
            sourceHoldDuration: 4000,
            expiresAt: new Date(this.START_DATE + 360000)
          }
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
            curveLocal: [[0, 0], [500, 1000]],
            curveRemote: [[0, 0], [1000, 500]]
          }]
        })
        this.sendRequest = sendRequest(this.config)
      })

      it('fails when an invalid response is returned', function () {
        return this.testRemoteQuote({
          remoteRequest: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixConrad + 'south.bob',
            sourceAmount: '200',
            destinationHoldDuration: 3000
          }),
          remoteResponse: IlpPacket.serializeIlqpByDestinationResponse({
            sourceAmount: '200',
            sourceHoldDuration: 5678
          }),
          request: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixConrad + 'south.bob',
            sourceAmount: '100',
            destinationHoldDuration: 3000
          }),
          response: {
            code: 'F01',
            name: 'Invalid Packet',
            triggeredBy: this.config.account,
            forwardedBy: [],
            triggeredAt: new Date(this.START_DATE),
            data: ''
          }
        })
      })

      it('relays an error packet', function () {
        return this.testRemoteQuote({
          remoteRequest: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixConrad + 'south.bob',
            sourceAmount: '200',
            destinationHoldDuration: 3000
          }),
          remoteResponse: IlpPacket.serializeIlpError(this.config.ilpErrors.T00_Internal_Error()),
          request: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixConrad + 'south.bob',
            sourceAmount: '100',
            destinationHoldDuration: 3000
          }),
          response: Object.assign(this.config.ilpErrors.T00_Internal_Error(), {
            forwardedBy: [this.config.account]
          })
        })
      })

      it('by source', function () {
        return this.testRemoteQuote({
          remoteRequest: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixConrad + 'south.bob',
            sourceAmount: '200',
            destinationHoldDuration: 3000
          }),
          remoteResponse: IlpPacket.serializeIlqpBySourceResponse({
            destinationAmount: '1234',
            sourceHoldDuration: 5678
          }),
          request: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixConrad + 'south.bob',
            sourceAmount: '100',
            destinationHoldDuration: 3000
          }),
          response: {
            destinationAmount: '1234',
            sourceHoldDuration: 5678 + 1000
          }
        })
      })

      it('by destination', function () {
        return this.testRemoteQuote({
          remoteRequest: IlpPacket.serializeIlqpByDestinationRequest({
            destinationAccount: this.prefixConrad + 'south.bob',
            destinationAmount: '100',
            destinationHoldDuration: 3000
          }),
          remoteResponse: IlpPacket.serializeIlqpByDestinationResponse({
            sourceAmount: '222',
            sourceHoldDuration: 5678
          }),
          request: IlpPacket.serializeIlqpByDestinationRequest({
            destinationAccount: this.prefixConrad + 'south.bob',
            destinationAmount: '100',
            destinationHoldDuration: 3000
          }),
          response: {
            sourceAmount: '112',
            sourceHoldDuration: 5678 + 1000
          }
        })
      })

      describe('by liquidity', function () {
        before(function () {
          this.testRemoteLiquidityQuote = function (test) {
            test = Object.assign({
              remoteAppliesToPrefix: this.prefixConrad,
              responseAppliesToPrefix: this.prefixConrad,
              remoteExpiryDuration: 1234,
              responseExpiryDuration: 1234
            }, test)
            return this.testRemoteQuote({
              remoteRequest: IlpPacket.serializeIlqpLiquidityRequest({
                destinationAccount: this.prefixConrad + 'south.bob',
                destinationHoldDuration: 3000
              }),
              remoteResponse: IlpPacket.serializeIlqpLiquidityResponse({
                liquidityCurve: (new LiquidityCurve([[0, 0], [100, 300]])).toBuffer(),
                appliesToPrefix: test.remoteAppliesToPrefix,
                sourceHoldDuration: 5678,
                expiresAt: new Date(this.START_DATE + test.remoteExpiryDuration)
              }),
              request: IlpPacket.serializeIlqpLiquidityRequest({
                destinationAccount: this.prefixConrad + 'south.bob',
                destinationHoldDuration: 3000
              }),
              response: {
                liquidityCurve: (new LiquidityCurve([[0, 0], [50, 300]])).toBuffer(),
                appliesToPrefix: test.responseAppliesToPrefix,
                sourceHoldDuration: 5678 + 1000,
                expiresAt: new Date(this.START_DATE + test.responseExpiryDuration)
              }
            })
          }
        })

        it('(specific remote appliesToPrefix)', function () {
          return this.testRemoteLiquidityQuote({
            remoteAppliesToPrefix: this.prefixConrad + 'south.bob',
            responseAppliesToPrefix: this.prefixConrad + 'south.bob'
          })
        })

        it('(general remote appliesToPrefix)', function () {
          return this.testRemoteLiquidityQuote({
            remoteAppliesToPrefix: '',
            responseAppliesToPrefix: this.prefixConrad
          })
        })

        it('(low remote expiry)', function () {
          return this.testRemoteLiquidityQuote({
            remoteExpiryDuration: 1234,
            responseExpiryDuration: 1234
          })
        })

        it('(high remote expiry)', function () {
          return this.testRemoteLiquidityQuote({
            remoteExpiryDuration: 360001,
            responseExpiryDuration: 360000
          })
        })
      })
    })
  })
})
