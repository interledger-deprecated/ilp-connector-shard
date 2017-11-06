'use strict'

const crypto = require('crypto')
const PublicApp = require('./src/lib/public-app')
const PrivateApp = require('./src/lib/private-app')
const RoutingTable = require('./src/lib/routing-table')

module.exports = ({ plugin, internalUri, initialTable, uuidSecret, publicPort, privatePort }) => {
  uuidSecret = uuidSecret || crypto.randomBytes(16)
  publicPort = publicPort || 8080
  privatePort = privatePort || 8081

  // TODO: This should be cleaner and part of the plugin interface
  //       I.e. if a plugin wants us to create an RPC server, it should tell us
  //       the necessary parameters.
  const prefix = plugin._prefix
  const token = plugin._getAuthToken()
  const account = plugin.getAccount()
  const peerAccount = plugin.getPeerAccount()

  const routingTable = new RoutingTable({ initialTable })

  const { ilpErrors, rejectionMessages } = require('./src/lib/errors')({ account })

  const handlers = {
    sendRequest: require('./src/handlers/public/send-request')({
      ilpErrors,
      peerAccount,
      prefix,
      routingTable
    }),
    sendTransfer: require('./src/handlers/public/send-transfer')({
      plugin,
      prefix,
      rejectionMessages,
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
    publicApp.listen(publicPort)
    privateApp.listen(privatePort)

    return async () => {
      await plugin.disconnect()
      plugin.deregisterRequestHandler(handlers.sendRequest)
      plugin.off('incoming_prepare', handlers.sendTransfer)
      plugin.off('outgoing_reject', handlers.rejectIncomingTransfer)
      plugin.off('outgoing_fulfill', handlers.fulfillCondition)
      publicApp.close()
      privateApp.close()
    }
  }

  return start()
}
