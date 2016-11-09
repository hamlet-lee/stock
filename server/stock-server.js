var uuid = require('node-uuid');
var dateFormat = require('dateformat');
var mysql      = require('mysql');
var request = require('request');
var iconv = require('iconv-lite');
var CronJob = require('cron').CronJob;
var format = require('string-template');

/* = mysql.createPool({
  connectionLimit: 10,
  host     : 'localhost',
  user     : 'cake',
  password : 'cakeisme',
  database : 'cake',
  charset : 'UTF8_GENERAL_CI'
});
*/

var jsonfile = require('jsonfile')
var file = 'conf.json'
var conf = jsonfile.readFileSync(file);
var poolSpec = conf.pool;
var stockListUrl = conf.stockListUrl;
console.log("read file" + JSON.stringify( poolSpec ));

var pool = mysql.createPool( poolSpec );
 
var express = require('express');
var app = express();
var fs = require("fs");

var bodyParser = require('body-parser');
var multer = require('multer'); // v1.0.5
var upload = multer(); // for parsing multipart/form-data

function getDate(now){
  return dateFormat(now,'yyyy-mm-dd');
}

function genStk( code, rows ){
  //console.log(`code=${code}`);
  let high = Math.max.apply(null, rows.map( r => r.high ));
  //console.log(`high=${high}`);
  let low = Math.min.apply(null, rows.map( r => r.low) );
  let cur = rows[rows.length - 1].close;
  
  let highPos = rows.length - 1;
  while( highPos >= 0 ){
    if( rows[highPos].high == high ) {
      break;
    }
    highPos--;
  }
  
  let lowPos = rows.length - 1;
  while( lowPos >= 0 ){
    if( rows[lowPos].low == low) {
      break;
    }
    lowPos--;
  }

  let sumVol = 0;
  rows.forEach( r => sumVol += r.volume );
  
  let avgVol = sumVol / rows.length;
  let volLevel = rows[rows.length-1].volume / avgVol;
  let toHigh = rows.length - highPos;
  let toLow = rows.length - lowPos;
  
  return {
    code,
    high,
    low,
    toHigh,
    toLow,
    level: (cur - low) / (high - low),
    volLevel,
    sign: (toHigh > toLow ? 1: -1)
  };
}

function processCodeList(body){ 
  let re = /\.html">([^<>\(]+)\((\d+)\)</mg;
  let match;
  while( match = re.exec(body) ){
    console.log(`${match[1]} -> ${match[2]}`);
    pool.query("insert into tbl_code (code, name) values (?,?)", [ match[2], match[1]]);
  }
}

//processStockList(">abce(200552)<\n>eee(222222)<");
//end();
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(express.static('client'));
app.get('/updateStockList',
  function (req, res){
    let url = stockListUrl;
    request({uri: url, encoding: null}, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        body =  iconv.decode(body, 'gbk');
        //console.log(body);
        processCodeList( body );
      }
    });          
    res.end("done");
  }
);
app.get('/allData', 
  function (req, res){
    pool.query( "SELECT DISTINCT(CONCAT(c.code , ',', c.name)) AS code_name FROM tbl_daily d, tbl_code c WHERE c.code = d.code", function (err, outerRows){
      let retList = [];
      let processed = 0;
      outerRows.forEach( row => {
        let [code,name] = row.code_name.split(",");
        pool.query( "select high, low, close, volume from tbl_daily where code = ? order by date asc", 
                    [ code ],
                    (err, rows) => {
                      //console.log(err);
                      //console.log(rows);
                      var stkResult = genStk(code, rows);
                      stkResult.name = name;
                      retList.push ( stkResult );
                      processed++;
                      //console.log(`processed=${processed} outerRows.length=${outerRows.length}`);
                      if( processed == outerRows.length) {
                        res.end( JSON.stringify(retList) );
                      }
                    }
        );
        console.log( `${code} ${name}` );
      });
    });
  }
);


function updateDaily(code, backDays = 180){
  console.log(`updating code=${code}`);
  var now = new Date().getTime();
  for( var k = -backDays; k <= 0; k+= 50){
    var end_date = getDate(now);
    var s = now + 1000 * 60 * 60 * 24 * k;
    console.log(`s=${s}`);
    var start_date = getDate(s);
    var url = format( conf.stockDailyUrl, {
      code, start_date, end_date
    });
    console.log("url="+url);
    request(url, function (error, response, body) {
                  if (!error && response.statusCode == 200) {
                    var d = JSON.parse(body);
                    d.data.forEach(
                      function(t){
                        var sql = "insert into tbl_daily (code, date, high, close, low, volume, amount) values (?, ?, ?, ? ,? ,? ,?)";
                        pool.query(sql, [code, t.date, t.high * 100, t.close * 100, t.low * 100, t.volume, t.amount ]);
                    });
                    console.log(body);
                  }
                }
    );
  }
}

new CronJob('0 0 18 * * 1-5', function() {
  console.log('update daily status');
  
  pool.query( "SELECT DISTINCT(code) AS code FROM tbl_daily d", (err, outerRows) => {
    outerRows.forEach( r => updateDaily(r.code, 5) );
  });
   
}, null, true, 'Asia/Shanghai');


function addDailyByName(name, res){
  pool.query("SELECT code from tbl_code where name =?", [name], (err, sqlres) =>{
    if( sqlres.length > 0) {
      updateDaily(sqlres[0].code); 
      res && res.end("OK");
    }else{
      res && res.end("ERROR");
    }
  });
}

app.get('/addDailyByName/:name', 
          function (req, res) {
            
          }
   );

app.get('/addDaily/:code', 
          function (req, res) {
            var code = req.params.code;
            if( code.match(/^\d+$/) ) {
              console.log("by code");
              updateDaily(code); 
              res.end("OK");  
            }else{
              console.log("by name");
              addDailyByName(code, res);
            }
          }
   );

var server = app.listen(18081, function () {
   var host = server.address().address
   var port = server.address().port

   console.log("Example app listening at http://%s:%s", host, port)
});

