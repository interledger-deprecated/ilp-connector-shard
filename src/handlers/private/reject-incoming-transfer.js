'use strict'

module.exports = ({ plugin }) => async ({ id, rejectionMessage }) => {
  if (typeof rejectionMessage.triggeredAt === 'string') {
    rejectionMessage.triggeredAt = new Date(rejectionMessage.triggeredAt)
  }
  await plugin.rejectIncomingTransfer(id, rejectionMessage)
}
