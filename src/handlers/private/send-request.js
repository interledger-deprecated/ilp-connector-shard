'use strict'

module.exports = ({ plugin, account, peerAccount }) => async ({ ilp }) => {
  return plugin.sendRequest({
    from: account,
    to: peerAccount,
    ilp
  })
}
