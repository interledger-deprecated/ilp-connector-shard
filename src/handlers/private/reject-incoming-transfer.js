'use strict'

module.exports = ({ plugin }) => async ({ id, rejectionMessage }) => {
  await plugin.rejectIncomingTransfer(id, rejectionMessage)
}
