'use strict'

const crypto = require('crypto')
const request = require('superagent')
const PrivateApp = require('./src/lib/private-app')
const RoutingTable = require('./src/lib/routing-table')
const CurveCache = require('./src/lib/curve-cache')

module.exports = ({
  plugin, // LedgerPlugin
  internalUri, // String
  routeManagerUri, // String
  initialTable, // [{prefix, shard, curveLocal, local}]
  uuidSecret, // Buffer
  privatePort // Integer
}) => {
  uuidSecret = uuidSecret || crypto.randomBytes(16)
  privatePort = privatePort || 8081

  // TODO: This should be cleaner and part of the plugin interface
  //       I.e. if a plugin wants us to create an RPC server, it should tell us
  //       the necessary parameters.
  const prefix = plugin._prefix
  const account = plugin.getAccount()
  const peerAccount = plugin.getPeerAccount()

  const routingTable = new RoutingTable({ initialTable })
  const curveCache = new CurveCache({})

  const ilpErrors = require('./src/lib/ilp-errors')({ account })

  const handlers = {
    sendRequest: require('./src/handlers/public/send-request')({
      ilpErrors,
      peerAccount,
      prefix,
      routingTable,
      routeManagerUri
    }),
    sendTransfer: require('./src/handlers/public/send-transfer')({
      plugin,
      prefix,
      ilpErrors,
      routingTable,
      curveCache,
      internalUri,
      uuidSecret
    }),
    rejectIncomingTransfer: require('./src/handlers/public/reject-incoming-transfer')(),
    fulfillCondition: require('./src/handlers/public/fulfill-condition')()
  }

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
    }),
    updateRoutes: require('./src/handlers/private/update-routes')({
      routingTable
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
    privateApp.listen(privatePort)

    if (routeManagerUri) {
      await request.post(routeManagerUri + '/internal/shard/' + encodeURIComponent(prefix))
        .then(() => console.log('connector-shard: route-manager ok'))
        .catch((err) => console.log('connector-shard: route-manager error', err.message))
    }

    return async () => {
      await plugin.disconnect()
      plugin.deregisterRequestHandler(handlers.sendRequest)
      plugin.off('incoming_prepare', handlers.sendTransfer)
      plugin.off('outgoing_reject', handlers.rejectIncomingTransfer)
      plugin.off('outgoing_fulfill', handlers.fulfillCondition)
      privateApp.close()
    }
  }

  return start()
}
