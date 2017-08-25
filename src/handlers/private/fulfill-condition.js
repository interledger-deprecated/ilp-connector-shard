'use strict'

module.exports = ({ plugin }) => async ({ id, fulfillment }) => {
  await plugin.fulfillCondition(id, fulfillment)
}
