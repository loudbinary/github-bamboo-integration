var skynet = require('./skynet');

skynet.github.updateIssueStatus('hello',function(err,results){
    console.log(results);
    console.log('test')
})