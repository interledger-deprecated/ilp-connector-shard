'use strict'

module.exports = ({ plugin, account, peerAccount }) => async ({ transfer }) => {
  try {
    return {
      state: 'fulfilled',
      data: plugin.sendTransfer(transfer)
    }
  } catch (e) {
    return {
      state: 'rejected',
      data: e.reason
    }
  }
}
