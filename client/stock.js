$(function(){
  let $screen = $("#screen");
  function foundConflict(poss, p){
    let found = false;
    poss.forEach( (pos) => {
      if( Math.abs( pos.left - p.left ) < 15 && Math.abs(pos.top - p.top ) < 25 ){
        found = true;
      }
    });
    return found;
  }
  function draw(data){
    let s = 0;
    let maxVol=-1000000;
    let minVol=1000000;
    for(let i=0; i<data.length; i++){
      maxVol = Math.max(maxVol, data[ i ].volLevel);
      minVol = Math.min(minVol, data[ i ].volLevel);
    }

    let ww = $("#screen").width()/2;
    let hh = $("#screen").height();

    
    let maxToLow = Math.max.apply(null, data.map( (x) => x.toLow ));
    let maxToHigh = Math.max.apply(null, data.map( (x) => x.toHigh ));
    let dayUnit = $("#screen").width() / (maxToLow + maxToHigh);

    var poss = [];
    data.forEach( (d) => {
      let $n = $(_.template(templates.stockBlock, {d}) );
      
      let left = (d.sign<0? d.toHigh*dayUnit: (d.toLow+maxToHigh)*dayUnit) ;
      //let left = ww + d.sign * d.level * ww ;
      let top = hh - d.level * hh;
      while( foundConflict(poss, {left, top}) ){
        left += 100;
      }
      poss.push({left, top});
      $n.css({ left, top });
      if( d.sign < 0 ){
        $n.css({
          "border-color":"green",
          "border-width":"1px"
        });
        $n.find(".volBarLow").css("background-color", "green");
      }else{
        $n.css({
          "border-color":"red",
          "border-width":"1px"
        });
        $n.find(".volBarLow").css("background-color", "red");
      }
      
      let lowPart = (d.volLevel - d.minVolLevel) / (d.maxVolLevel - d.minVolLevel);
      let highPart = 1 - lowPart;
      $n.find(".volBarHigh").css("flex", Math.round(highPart * 10));
      $n.find(".volBarLow").css("flex", Math.round(lowPart * 10));

      let k = Math.floor(255 - 255 * (d.volLevel - minVol) / (maxVol - minVol));
      let c = "rgb("+k+",255,255)";
      console.log(c);
      $n.css("background-color", c);
      $screen.append($n); 
    });
    $screen.append();
  }

  function drawLatestMemo(data){
    $("#latest").empty();
    
    $("#latest").append( $(_.template(templates.latestHead,{}) ) );
    data.forEach( (memo) => {
      $("#latest").append(_.template(templates.latestItem, {memo}));
    });
  }

  function genWenCai(q){
    return "http://www.iwencai.com/stockpick/search?w="+encodeURIComponent(q);
  }
  function showStockMemo(code){
    $("#memo").fadeOut();
    $.ajax({
      url: "/memo/"+code,
      success: (data) => {
        console.log(data);
        var d = JSON.parse(data);
        var memos = d.memos;
        var name = d.name;

        var wencaiUrls = {
          "市盈率": genWenCai(code + " 市盈率"),
          "市净率": genWenCai(code + " 市净率"),
          "市销率": genWenCai(code + " 市销率"),
          "基本情况": genWenCai(code),
          "主力持仓": genWenCai(code + " 主力持仓")
        };

        $("#memo").empty();
        $("#memo").append( $(_.template(templates.stockMemoHead,{name, code, wencaiUrls}) ) );
        memos.forEach( (memo) => {
          $("#memo").append(_.template(templates.stockMemoItem, {memo}));
        });
        var h = _.template('<div data-code="<%- code%>" class="add-memo"> <textarea type="text" class="myMemo"/><button class="btnAddMemo">添加备注</button> </div>',{code});
        $("#memo").append(
          $(h)
        );
        $("#memo").fadeIn();
        $('html, body').animate({
          scrollTop: $("#memo").offset().top,
        }, 0);
      },
      error: (e) => alert(JSON.stringify(e))
    });
  }
	$.ajax({
		url: "/allData",
		method: "GET",
		contentType: 'application/json',
		success: function(res) {
      console.log(res);
      draw(JSON.parse(res));
		},
		error: function(xhr, status, error) {
		  var err = xhr.responseText;
		  alert(err);
		}
	});

  $.ajax({
    url: "/latestMemo",
    method: "GET",
    contentType: 'application/json',
    success: function(res) {
      console.log(res);
      drawLatestMemo(JSON.parse(res));
    },
    error: function(xhr, status, error) {
      var err = xhr.responseText;
      alert(err);
    }
  });

  $("body").on("click",".btnAddMemo", (e) =>{
    let code = $(e.target).closest(".add-memo").data("code");
    let memo = $(e.target).closest(".add-memo").find(".myMemo").val();
    $.ajax({
      url: "/memo/" + code,
      method: "put",
      data: {code, memo},
      success: () => alert('done'),
      error: (e) => alert( JSON.stringify(e))
    });
  });
  $("body").on("click",".stock-href", (e) => {
    let code = $(e.target).closest(".stock-block").data("code");
    console.log("code: " + code);
    e.preventDefault();
    showStockMemo(code);
  });
  
  $("body").on("click",".latest-stock-href", (e)=>{
    let code = $(e.target).closest(".memo-item").data("code");
    e.preventDefault();
    console.log("code: " + code);
    e.preventDefault();
    showStockMemo(code);
  });

  $("#btnAdd").on("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    let code = $("#stkCode").val();
    $.ajax({
      url: '/addDaily/' + code,
      success: () => alert('done'),
      error: (e) => alert(JSON.stringify(e))
    });
  });
});

window.onerror = function(message, source, lineno, colno, error) {
        alert("line" + lineno+ " " + message);
}
