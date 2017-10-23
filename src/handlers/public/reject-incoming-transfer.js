'use strict'

const request = require('superagent')

module.exports = () => async (transfer, rejectionMessage) => {
  const source = transfer.noteToSelf.source
  await request.post(source.uri + '/internal/transfer/' + source.id + '/rejection')
    .send(rejectionMessage)
}
