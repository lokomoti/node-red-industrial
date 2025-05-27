FROM nodered/node-red:latest

RUN npm set strict-ssl false

RUN npm install node-red-contrib-influxdb
RUN npm install node-red-contrib-opcua
RUN npm install node-red-dashboard
RUN npm install node-red-contrib-modbus
RUN npm install node-red-contrib-s7
RUN npm install node-red-node-ping
RUN npm install node-red-dashboard

RUN npm set strict-ssl true

COPY settings.js /data/settings.js
EXPOSE 1880
CMD ["npm", "start"]
