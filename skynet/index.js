var path = require('path')
var skynet = exports;
require('fs').readdirSync(__dirname).forEach(function (file) {
    /* If its the current file ignore it */
    if (file === 'index.js') return;
    skynet[path.basename(file,'.js')] = require(path.join(__dirname, file));
    /* Store module with its name (from filename) */
    //module.exports[path.basename(file, '.js')] = require(path.join(__dirname, file));
});