var GitHub = require('github-api');
const gh = new GitHub({
    username: 'openanthem-admin',
    password: '&1410h65117375'
});

var sha = 'abd0131261b43030821f276fd0e00963bc0fcc21';
var options = {
    state: 'success',
    target_url: 'https://testing.com',
    description: 'Doing more work',
    context: 'pr-review'
}


var loudbinary = gh.getUser('openanthem-admin');

var repo = gh.getRepo('openanthem/cortex');
/*
var pr = cortex.listPullRequests({},function(err,results){
    console.log(err);
    console.log(results);
})
*/
repo.updateStatus(sha,options)
console.log(repo);