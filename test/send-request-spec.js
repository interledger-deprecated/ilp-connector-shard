'use strict'
/* eslint-env mocha */

const assert = require('assert')
const lolex = require('lolex')
const nock = require('nock')
const IlpPacket = require('ilp-packet')
const base64url = require('base64url')
const { LiquidityCurve } = require('ilp-routing')
const sendRequestPublic = require('../src/handlers/public/send-request')
const RoutingTable = require('../src/lib/routing-table')

const START_TIME = 1500000000000

describe('Send Request (public)', () => {
  before(() => {
    this.clock = lolex.install({now: START_TIME})
  })

  after(() => {
    this.clock.uninstall()
  })

  beforeEach(() => {
    this.prefixWest = 'g.usd.connie.west.'
    this.prefixEast = 'g.eur.connie.east.'
    this.config = {
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
      })
    }
    this.config.ilpErrors = require('../src/lib/ilp-errors')(this.config)
    this.sendRequest = sendRequestPublic(this.config)
  })

  afterEach(() => {
    assert(nock.isDone())
    nock.cleanAll()
  })

  describe('broadcast_routes', () => {
    it('responds with a simple message', async () => {
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

  describe('Quote', () => {
    const testQuote = async (test) => {
      const res = await this.sendRequest({ ilp: test.request })
      assert.equal(res.to, this.config.peerAccount)
      assert.equal(res.ledger, this.prefixWest)
      assert.deepStrictEqual(IlpPacket.deserializeIlpPacket(Buffer.from(res.ilp, 'base64')).data, test.response)
    }

    const testRemoteQuote = (test) => {
      nock('http://connie-east:8081')
        .post('/internal/request', { ilp: base64url(test.remoteRequest) })
        .reply(200, { ilp: base64url(test.remoteResponse) })
      return testQuote(test)
    }

    it('returns an error when no matching route exists', () =>
      testQuote({
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
          triggeredAt: new Date(START_TIME),
          data: ''
        }
      }))

    describe('with a local route', () => {
      it('by source', () =>
        testQuote({
          request: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixEast + 'bob',
            sourceAmount: '100',
            destinationHoldDuration: 3000
          }),
          response: {
            destinationAmount: '200',
            sourceHoldDuration: 4000
          }
        }))

      it('by destination', () =>
        testQuote({
          request: IlpPacket.serializeIlqpByDestinationRequest({
            destinationAccount: this.prefixEast + 'bob',
            destinationAmount: '200',
            destinationHoldDuration: 3000
          }),
          response: {
            sourceAmount: '101',
            sourceHoldDuration: 4000
          }
        }))

      it('by liquidity', () =>
        testQuote({
          request: IlpPacket.serializeIlqpLiquidityRequest({
            destinationAccount: this.prefixEast + 'bob',
            destinationHoldDuration: 3000
          }),
          response: {
            liquidityCurve: (new LiquidityCurve([[0, 0], [500, 1000]])).toBuffer(),
            appliesToPrefix: this.prefixEast,
            sourceHoldDuration: 4000,
            expiresAt: new Date(START_TIME + 360000)
          }
        }))
    })

    describe('with a remote route', () => {
      beforeEach(() => {
        this.prefixCharles = 'g.aud.charles.'
        this.config.routingTable = new RoutingTable({
          initialTable: [{
            prefix: this.prefixCharles,
            shard: 'http://connie-east:8081',
            curveLocal: [[0, 0], [500, 1000]]
          }]
        })
        this.sendRequest = sendRequestPublic(this.config)
      })

      it('fails when an invalid response is returned', () =>
        testRemoteQuote({
          remoteRequest: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixCharles + 'south.bob',
            sourceAmount: '200',
            destinationHoldDuration: 3000
          }),
          remoteResponse: IlpPacket.serializeIlqpByDestinationResponse({
            sourceAmount: '200',
            sourceHoldDuration: 5678
          }),
          request: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixCharles + 'south.bob',
            sourceAmount: '100',
            destinationHoldDuration: 3000
          }),
          response: {
            code: 'F01',
            name: 'Invalid Packet',
            triggeredBy: this.config.account,
            forwardedBy: [],
            triggeredAt: new Date(START_TIME),
            data: ''
          }
        }))

      it('relays an error packet', () =>
        testRemoteQuote({
          remoteRequest: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixCharles + 'south.bob',
            sourceAmount: '200',
            destinationHoldDuration: 3000
          }),
          remoteResponse: IlpPacket.serializeIlpError(this.config.ilpErrors.T00_Internal_Error()),
          request: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixCharles + 'south.bob',
            sourceAmount: '100',
            destinationHoldDuration: 3000
          }),
          response: Object.assign(this.config.ilpErrors.T00_Internal_Error(), {
            forwardedBy: [this.config.account]
          })
        }))

      it('by source', () =>
        testRemoteQuote({
          remoteRequest: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixCharles + 'south.bob',
            sourceAmount: '200',
            destinationHoldDuration: 3000
          }),
          remoteResponse: IlpPacket.serializeIlqpBySourceResponse({
            destinationAmount: '1234',
            sourceHoldDuration: 5678
          }),
          request: IlpPacket.serializeIlqpBySourceRequest({
            destinationAccount: this.prefixCharles + 'south.bob',
            sourceAmount: '100',
            destinationHoldDuration: 3000
          }),
          response: {
            destinationAmount: '1234',
            sourceHoldDuration: 5678 + 1000
          }
        }))

      it('by destination', () =>
        testRemoteQuote({
          remoteRequest: IlpPacket.serializeIlqpByDestinationRequest({
            destinationAccount: this.prefixCharles + 'south.bob',
            destinationAmount: '100',
            destinationHoldDuration: 3000
          }),
          remoteResponse: IlpPacket.serializeIlqpByDestinationResponse({
            sourceAmount: '222',
            sourceHoldDuration: 5678
          }),
          request: IlpPacket.serializeIlqpByDestinationRequest({
            destinationAccount: this.prefixCharles + 'south.bob',
            destinationAmount: '100',
            destinationHoldDuration: 3000
          }),
          response: {
            sourceAmount: '112',
            sourceHoldDuration: 5678 + 1000
          }
        }))

      describe('by liquidity', () => {
        const testRemoteLiquidityQuote = (test) => {
          test = Object.assign({
            remoteAppliesToPrefix: this.prefixCharles,
            responseAppliesToPrefix: this.prefixCharles,
            remoteExpiryDuration: 1234,
            responseExpiryDuration: 1234
          }, test)
          return testRemoteQuote({
            remoteRequest: IlpPacket.serializeIlqpLiquidityRequest({
              destinationAccount: this.prefixCharles + 'south.bob',
              destinationHoldDuration: 3000
            }),
            remoteResponse: IlpPacket.serializeIlqpLiquidityResponse({
              liquidityCurve: (new LiquidityCurve([[0, 0], [100, 300]])).toBuffer(),
              appliesToPrefix: test.remoteAppliesToPrefix,
              sourceHoldDuration: 5678,
              expiresAt: new Date(START_TIME + test.remoteExpiryDuration)
            }),
            request: IlpPacket.serializeIlqpLiquidityRequest({
              destinationAccount: this.prefixCharles + 'south.bob',
              destinationHoldDuration: 3000
            }),
            response: {
              liquidityCurve: (new LiquidityCurve([[0, 0], [50, 300]])).toBuffer(),
              appliesToPrefix: test.responseAppliesToPrefix,
              sourceHoldDuration: 5678 + 1000,
              expiresAt: new Date(START_TIME + test.responseExpiryDuration)
            }
          })
        }

        it('(specific remote appliesToPrefix)', () =>
          testRemoteLiquidityQuote({
            remoteAppliesToPrefix: this.prefixCharles + 'south.bob',
            responseAppliesToPrefix: this.prefixCharles + 'south.bob'
          }))

        it('(general remote appliesToPrefix)', () =>
          testRemoteLiquidityQuote({
            remoteAppliesToPrefix: '',
            responseAppliesToPrefix: this.prefixCharles
          }))

        it('(low remote expiry)', () =>
          testRemoteLiquidityQuote({
            remoteExpiryDuration: 1234,
            responseExpiryDuration: 1234
          }))

        it('(high remote expiry)', () =>
          testRemoteLiquidityQuote({
            remoteExpiryDuration: 360001,
            responseExpiryDuration: 360000
          }))
      })
    })
  })
})
