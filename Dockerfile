FROM nodered/node-red:5.0.7

RUN npm set strict-ssl false && \
    npm install \
    bcryptjs \
    ldap-authentication \
    node-red-contrib-influxdb \
    node-red-contrib-opcua \
    node-red-contrib-modbus \
    node-red-contrib-s7 \
    node-red-node-ping \
    @flowfuse/node-red-dashboard && \
    npm set strict-ssl true

COPY settings.js /data/settings.js
COPY user-authentication.js /data/user-authentication.js
EXPOSE 1880
CMD ["npm", "start"]
