'use strict'

const request = require('superagent')

module.exports = () => async (transfer, fulfillment, fulfillmentData) => {
  const source = transfer.noteToSelf.source

  await request.post(source.uri + '/internal/transfer/' + source.id + '/fulfillment')
    .send({ fulfillment, fulfillmentData })
}
