const Plugin = require('ilp-plugin-payment-channel-framework')
const IlpPacket = require('ilp-packet')

const pluginA = new Plugin({
  server: 'btp+ws://:secret@localhost:7001',
  insecure: true
})

const pluginB = new Plugin({
  server: 'btp+ws://:secret@localhost:7002',
  insecure: true
})

const crypto = require('crypto')
const uuid = require('uuid')
const base64url = require('base64url')
const fulfillment = crypto.randomBytes(32)
const condition = crypto.createHash('sha256').update(fulfillment).digest()
const expiry = new Date(Date.now() + 10000)

async function run () {
  await pluginA.connect()
  await pluginB.connect()

  await new Promise((resolve) => setTimeout(resolve, 5000))

  pluginB.registerTransferHandler((transfer) => {
    console.log('GOT NOTIFICATION of transfer:', transfer)
    return { fulfillment: base64url(fulfillment) }
  })

  await pluginA.sendTransfer({
    id: uuid(),
    amount: 1000,
    executionCondition: base64url(condition),
    expiresAt: expiry.toISOString(),
    ilp: IlpPacket.serializeIlpPayment({
      amount: '1140',
      account: 'g.eur.connie.east.',
      data: ''
    })
  })
  console.log('END DATE:', Date.now())
  await new Promise((resolve) => setTimeout(resolve, 5000))
  process.exit(0)
}

run()
  .catch(async (e) => {
    console.log('END DATE:', Date.now())
    console.error(e)
    await new Promise((resolve) => setTimeout(resolve, 5000))
    process.exit(1)
  })
