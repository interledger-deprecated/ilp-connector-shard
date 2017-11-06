'use strict'
/* eslint-env mocha */

const assert = require('assert')
const crypto = require('crypto')
const IlpPacket = require('ilp-packet')
const base64url = require('base64url')
const Plugin = require('ilp-plugin-payment-channel-framework')
const startShard = require('../')
const Store = require('../src/lib/store')

describe('App', function () {
  beforeEach(async function () {
    this.clock.uninstall() // use real timers
    this.senderPlugin = new Plugin({ server: 'btp+ws://user:westtoken@127.0.0.1:8082' })
    this.receiverPlugin = new Plugin({
      maxBalance: '1000000000000',
      prefix: 'g.eur.connie.east.',
      listener: {port: 8085},
      info: {
        currencyScale: 9,
        currencyCode: 'EUR',
        prefix: 'g.eur.connie.east.',
        connectors: ['g.eur.connie.east.server']
      },
      authCheck: (username, token) => username === 'user' && token === 'easttoken',
      _store: new Store()
    })

    this.stopConnieWest = await startShard({
      internalUri: 'http://127.0.0.1:8081',
      plugin: new Plugin({
        maxBalance: '1000000000000',
        prefix: 'g.usd.connie.west.',
        authCheck: (username, token) => username === 'user' && token === 'westtoken',
        listener: {port: 8082},
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
        shard: 'http://127.0.0.1:8084',
        curveLocal: [[0, 0], [1000, 2000]],
        local: true
      }],
      publicPort: 8080,
      privatePort: 8081
    })

    this.stopConnieEast = await startShard({
      internalUri: 'http://127.0.0.1:8084',
      plugin: new Plugin({
        prefix: 'g.eur.connie.east.',
        server: 'btp+ws://user:easttoken@127.0.0.1:8085'
      }),
      publicPort: 8083,
      privatePort: 8084
    })

    await this.senderPlugin.connect()
    await this.receiverPlugin.connect()
  })

  afterEach(async function () {
    await this.senderPlugin.disconnect()
    await this.receiverPlugin.disconnect()
    await this.stopConnieWest()
    await this.stopConnieEast()
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
    const error = {
      code: 'R01',
      name: 'Insufficient Source Amount',
      triggeredBy: 'g.usd.connie.west.server',
      forwardedBy: [],
      triggeredAt: new Date(),
      data: 'Insufficient incoming liquidity'
    }
    const prepared = new Promise((resolve) =>
      this.receiverPlugin.on('incoming_prepare', resolve))
    const rejected = new Promise((resolve) =>
      this.senderPlugin.on('outgoing_reject', (transfer, reason) => {
        assert.equal(transfer.id, this.transfer.id)
        assert.deepStrictEqual(reason, error)
        resolve()
      }))
    await this.senderPlugin.sendTransfer(this.transfer)
    const lastTransfer = await prepared
    await this.receiverPlugin.rejectIncomingTransfer(lastTransfer.id, error)
    await rejected
  })
})
