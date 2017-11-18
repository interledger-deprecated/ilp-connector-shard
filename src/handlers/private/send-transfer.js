'use strict'

module.exports = ({ plugin, account, peerAccount }) => async ({ transfer }) => {
  try {
    return {
      state: 'fulfilled',
      data: await plugin.sendTransfer(transfer)
    }
  } catch (e) {
    console.log('ERROR:', e.name, e.reason)
    return {
      state: 'rejected',
      data: e.reason || e.message
    }
  }
}
