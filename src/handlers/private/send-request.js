'use strict'

module.exports = ({ plugin, account, peerAccount }) => async ({ ilp, custom }) => {
  return plugin.sendRequest({
    from: account,
    to: peerAccount,
    ilp,
    custom
  })
}
