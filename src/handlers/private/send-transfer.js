'use strict'

module.exports = ({ plugin, account, peerAccount }) => async ({ transfer }) => {
  transfer = Object.assign({}, transfer, {
    from: account,
    to: peerAccount
  })

  await plugin.sendTransfer(transfer)
}
