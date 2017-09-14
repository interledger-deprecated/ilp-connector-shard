'use strict'

const crypto = require('crypto')
const PublicApp = require('./src/lib/public-app')
const PrivateApp = require('./src/lib/private-app')
const Store = require('./src/lib/store')
const RoutingTable = require('./src/lib/routing-table')
const { assertEnv, envJson } = require('./src/util/env')

assertEnv('ICS_INTERNAL_URI')
assertEnv('ICS_PLUGIN')
assertEnv('ICS_PLUGIN_OPTS')

const Plugin = require(process.env.ICS_PLUGIN)
const pluginOpts = envJson('ICS_PLUGIN_OPTS')
if (pluginOpts.store) {
  const store = new Store()
  pluginOpts._store = store
}
const plugin = new Plugin(pluginOpts)

// TODO: This should be cleaner and part of the plugin interface
//       I.e. if a plugin wants us to create an RPC server, it should tell us
//       the necessary parameters.
const prefix = plugin._prefix
const token = plugin._getAuthToken()
const account = plugin.getAccount()
const peerAccount = plugin.getPeerAccount()

const internalUri = process.env.ICS_INTERNAL_URI
const uuidSecret = (process.env.ICS_UUID_SECRET && Buffer.from(process.env.ICS_UUID_SECRET, 'base64')) || crypto.randomBytes(16)

const routingTable = new RoutingTable({
  initialTable: envJson('ICS_INITIAL_ROUTING_TABLE')
})

const ilpErrors = require('./src/lib/ilp-errors')({ account })

const handlers = {
  sendRequest: require('./src/handlers/public/send-request')({
    peerAccount,
    prefix,
    routingTable,
    ilpErrors
  }),
  sendTransfer: require('./src/handlers/public/send-transfer')({
    prefix,
    routingTable,
    internalUri,
    uuidSecret
  }),
  rejectIncomingTransfer: require('./src/handlers/public/reject-incoming-transfer')(),
  fulfillCondition: require('./src/handlers/public/fulfill-condition')()
}

const publicApp = new PublicApp({
  plugin,
  token,
  peerAccount,
  prefix,
  handlers
})

const privateHandlers = {
  sendTransfer: require('./src/handlers/private/send-transfer')({
    plugin,
    account,
    peerAccount
  }),
  rejectIncomingTransfer: require('./src/handlers/private/reject-incoming-transfer')({
    plugin
  }),
  fulfillCondition: require('./src/handlers/private/fulfill-condition')({
    plugin
  }),
  sendRequest: require('./src/handlers/private/send-request')({
    plugin,
    account,
    peerAccount
  })
}

const privateApp = new PrivateApp({
  prefix,
  handlers: privateHandlers
})

const start = async () => {
  await plugin.connect()
  plugin.registerRequestHandler(handlers.sendRequest)
  plugin.on('incoming_prepare', handlers.sendTransfer)
  plugin.on('outgoing_reject', handlers.rejectIncomingTransfer)
  plugin.on('outgoing_fulfill', handlers.fulfillCondition)
  publicApp.listen(process.env.ICS_PUBLIC_PORT || 8080)
  privateApp.listen(process.env.ICS_PRIVATE_PORT || 8081)
}

start()
  .catch(err => console.error(err && err.stack))
