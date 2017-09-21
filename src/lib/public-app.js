'use strict'

const http = require('http')
const uuid = require('uuid')
const Koa = require('koa')
const Router = require('koa-router')
const Cors = require('kcors')
const Parser = require('koa-bodyparser')
const Logger = require('koa-logger')
const Boom = require('boom')

class PublicApp {
  constructor ({ plugin, peerAccount, prefix, token, handlers }) {
    const app = new Koa()
    const router = new Router()
    const cors = new Cors()
    const parser = new Parser()
    const logger = new Logger()

    app.use(logger)
    app.use(cors)
    app.use(parser)
    app.use(router.routes())
    app.use(router.allowedMethods({
      throw: true,
      notImplemented: () => Boom.notImplemented(),
      methodNotAllowed: () => Boom.methodNotAllowed()
    }))

    router.post('/rpc', this.handlePostRpc.bind(this))

    this.app = app
    this.router = router

    this.plugin = plugin
    this.peerAccount = peerAccount
    this.prefix = prefix
    this.token = token
    this.handlers = handlers
  }

  listen (port) {
    this.server = http.createServer(this.app.callback()).listen(port)
  }

  close () {
    this.server.close()
  }

  async handlePostRpc (ctx) {
    const { method, prefix } = ctx.query
    const body = ctx.request.body
    const auth = ctx.headers.authorization
    const id = uuid()

    console.log('got rpc', id, method, prefix, body)

    if (!method || !prefix) {
      ctx.body = 'both method and prefix must be defined'
      ctx.status = 400
      return
    }

    if (prefix !== this.prefix || auth !== 'Bearer ' + this.token) {
      console.log('denied unauthorized request for', prefix, 'with', auth)
      ctx.status = 401
      ctx.body = 'Unauthorized'
      return
    }

    ctx.body = await this.plugin.receive(method, ctx.request.body)
  }
}

module.exports = PublicApp
