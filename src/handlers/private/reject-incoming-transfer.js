'use strict'

module.exports = ({ plugin }) => async ({ id, rejectionMessage }) => {
  if (typeof rejectionMessage.triggered_at === 'string') {
    rejectionMessage.triggered_at = new Date(rejectionMessage.triggered_at)
  }
  await plugin.rejectIncomingTransfer(id, rejectionMessage)
}
