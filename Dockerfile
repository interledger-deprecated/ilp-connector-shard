FROM mhart/alpine-node:base-8

WORKDIR /src
ADD . .

EXPOSE 3000
CMD ["node", "node_modules/.bin/nodemon", "bin/start.js"]
