'use strict'

const crypto = require('crypto')
const request = require('superagent')
const PrivateApp = require('./src/lib/private-app')
const RoutingTable = require('./src/lib/routing-table')

module.exports = ({
  prefix,
  plugin, // LedgerPlugin
  internalUri, // String
  routeManagerUri, // String
  initialTable, // [{prefix, shard, curveLocal, local}]
  uuidSecret, // Buffer
  privatePort // Integer
}) => {
  uuidSecret = uuidSecret || crypto.randomBytes(16)
  privatePort = privatePort || 8081

  const account = prefix + 'connector' // TODO
  const routingTable = new RoutingTable({ initialTable })
  const ilpErrors = require('./src/lib/ilp-errors')({ account })

  const handlers = {
    sendTransfer: require('./src/handlers/public/send-transfer')({
      plugin,
      prefix,
      ilpErrors,
      routingTable,
      internalUri,
      uuidSecret
    })
  }

  const privateHandlers = {
    sendTransfer: require('./src/handlers/private/send-transfer')({
      plugin
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
    plugin.registerTransferHandler(handlers.sendTransfer)
    privateApp.listen(privatePort)

    if (routeManagerUri) {
      await request.post(routeManagerUri + '/internal/shard/' + encodeURIComponent(prefix))
        .then(() => console.log('connector-shard: route-manager ok'))
        .catch((err) => console.log('connector-shard: route-manager error', err.message))
    }

    return async () => {
      await plugin.disconnect()
      privateApp.close()
    }
  }

  return start()
}
