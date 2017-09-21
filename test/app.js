'use strict'
/* eslint-env mocha */

const assert = require('assert')
const crypto = require('crypto')
const http = require('http')
const request = require('superagent')
const IlpPacket = require('ilp-packet')
const base64url = require('base64url')
const Plugin = require('ilp-plugin-payment-channel-framework')
const startShard = require('../')
const Store = require('../src/lib/store')

const Koa = require('koa')
const parser = require('koa-bodyparser')
const router = require('koa-router')()

describe('App', function () {
  beforeEach(async function () {
    this.clock.uninstall() // use real timers

    this.senderPlugin = new Plugin({
      maxBalance: '1000000000000',
      rpcUri: 'http://127.0.0.1:8080/rpc',
      token: 'westtoken',
      prefix: 'g.usd.connie.west.'
    })
    this.receiverPlugin = new Plugin({
      maxBalance: '1000000000000',
      rpcUri: 'http://127.0.0.1:8082/rpc',
      token: 'easttoken',
      prefix: 'g.eur.connie.east.',
      info: {
        currencyScale: 9,
        currencyCode: 'EUR',
        prefix: 'g.eur.connie.east.',
        connectors: ['g.eur.connie.east.server']
      },
      _store: new Store()
    })

    this.plugins = {
      sender: this.senderPlugin,
      receiver: this.receiverPlugin
    }

    const rpc = async (name, context) => {
      const plugin = this.plugins[name]
      const { method } = context.query
      const params = context.request.body
      context.body = await plugin.receive(method, params)
    }
    router.post('/sender', rpc.bind(null, 'sender'))
    router.post('/receiver', rpc.bind(null, 'receiver'))
    const app = new Koa()
    app
      .use(parser())
      .use(router.routes())
      .use(router.allowedMethods())
    this.server = http.createServer(app.callback()).listen(8070)

    this.stopConnieWest = await startShard({
      internalUri: 'http://127.0.0.1:8081',
      plugin: new Plugin({
        maxBalance: '1000000000000',
        rpcUri: 'http://127.0.0.1:8070/sender',
        token: 'westtoken',
        prefix: 'g.usd.connie.west.',
        info: {
          currencyScale: 9,
          currencyCode: 'USD',
          prefix: 'g.usd.connie.west.',
          connectors: ['g.usd.connie.west.server']
        },
        _store: new Store()
      }),
      initialTable: [{
        prefix: 'g.eur.connie.east.',
        shard: 'http://127.0.0.1:8083',
        curveLocal: [[0, 0], [1000, 2000]],
        local: true
      }],
      publicPort: 8080,
      privatePort: 8081
    })

    this.stopConnieEast = await startShard({
      internalUri: 'http://127.0.0.1:8083',
      plugin: new Plugin({
        maxBalance: '1000000000000',
        rpcUri: 'http://127.0.0.1:8070/receiver',
        token: 'easttoken',
        prefix: 'g.eur.connie.east.'
      }),
      publicPort: 8082,
      privatePort: 8083
    })

    await this.senderPlugin.connect()
    await this.receiverPlugin.connect()
  })

  afterEach(async function () {
    await this.senderPlugin.disconnect()
    await this.receiverPlugin.disconnect()
    await this.stopConnieWest()
    await this.stopConnieEast()
    this.server.close()
  })

  it('gets a quote', async function () {
    const res = await this.senderPlugin.sendRequest({
      ledger: 'g.usd.connie.west.',
      to: 'g.usd.connie.west.server',
      ilp: base64url(IlpPacket.serializeIlqpBySourceRequest({
        destinationAccount: 'g.eur.connie.east.bob',
        sourceAmount: '50',
        destinationHoldDuration: 3000
      }))
    })
    const { data } = IlpPacket.deserializeIlpPacket(Buffer.from(res.ilp, 'base64'))
    assert.equal(res.to, 'g.usd.connie.west.client')
    assert.deepStrictEqual(data, {
      destinationAmount: '100',
      sourceHoldDuration: 4000
    })
  })

  before(function () {
    this.preimage = Buffer.from('UrZS+/aZQ36jUgjI/APIW1CwMYtDF7KuslIzVj4LTKU=', 'base64')
    this.hash = crypto.createHash('sha256').update(this.preimage).digest()
    this.ilpPacket = IlpPacket.serializeIlpPayment({
      account: 'g.eur.connie.east.bob',
      amount: '100'
    })
    this.transfer = {
      to: 'g.usd.connie.west.server',
      id: '5857d460-2a46-4545-8311-1539d99e78e8',
      amount: '51',
      ilp: base64url(this.ilpPacket),
      executionCondition: base64url(this.hash),
      expiresAt: (new Date(Date.now() + 5000)).toISOString()
    }
  })

  it('sends a payment', async function () {
    const prepared = new Promise((resolve) =>
      this.receiverPlugin.on('incoming_prepare', (transfer) => {
        assert.deepStrictEqual(transfer, {
          ledger: 'g.eur.connie.east.',
          from: 'g.eur.connie.east.client',
          to: 'g.eur.connie.east.server',
          id: transfer.id,
          amount: '100',
          ilp: base64url(this.ilpPacket),
          executionCondition: base64url(this.hash),
          expiresAt: transfer.expiresAt
        })
        resolve()
      }))
    await this.senderPlugin.sendTransfer(this.transfer)
    await prepared
  })

  it('fulfills a payment', async function () {
    const prepared = new Promise((resolve) =>
      this.receiverPlugin.on('incoming_prepare', resolve))
    const fulfilled = new Promise((resolve) =>
      this.senderPlugin.on('outgoing_fulfill', (transfer, fulfillment) => {
        assert.equal(transfer.id, this.transfer.id)
        assert.equal(fulfillment, base64url(this.preimage))
        resolve()
      }))
    await this.senderPlugin.sendTransfer(this.transfer)
    const lastTransfer = await prepared
    await this.receiverPlugin.fulfillCondition(lastTransfer.id, base64url(this.preimage))
    await fulfilled
  })

  it('rejects a payment', async function () {
    const prepared = new Promise((resolve) =>
      this.receiverPlugin.on('incoming_prepare', resolve))
    const rejected = new Promise((resolve) =>
      this.senderPlugin.on('outgoing_reject', (transfer, reason) => {
        assert.equal(transfer.id, this.transfer.id)
        assert.deepStrictEqual(reason, {code: 'T00'})
        resolve()
      }))
    await this.senderPlugin.sendTransfer(this.transfer)
    const lastTransfer = await prepared
    await this.receiverPlugin.rejectIncomingTransfer(lastTransfer.id, {code: 'T00'})
    await rejected
  })

  describe('errors', function () {
    ;[
      {
        desc: 'returns 400 for requests with no method',
        query: {prefix: 'g.usd.connie.west.'}
      },
      {
        desc: 'returns 400 for requests with no prefix',
        query: {method: 'send_transfer'}
      }
    ].forEach(function ({desc, query}) {
      it(desc, async function () {
        await request.post('http://127.0.0.1:8080/rpc')
          .query(query)
          .then(() => assert(false))
          .catch((err) => {
            assert.equal(err.status, 400)
          })
      })
    })

    ;[
      {
        desc: 'returns 401 for requests from the wrong prefix',
        opts: {prefix: 'g.usd.connie.invalid.'}
      },
      {
        desc: 'returns 401 for requests with the wrong token',
        opts: {token: 'invalidtoken'}
      }
    ].forEach(function ({desc, opts}) {
      it(desc, async function () {
        const senderPlugin = new Plugin(Object.assign({
          maxBalance: '1000000000000',
          rpcUri: 'http://127.0.0.1:8080/rpc',
          token: 'westtoken',
          prefix: 'g.usd.connie.west.'
        }, opts))
        await senderPlugin.connect().then(() => {
          assert(false)
        }).catch((err) => {
          assert.equal(err.status, 401)
          assert.equal(err.message, 'Unauthorized')
        })
      })
    })
  })
})
