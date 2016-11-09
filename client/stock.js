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
    
    var poss = [];
    data.forEach( (d) => {
      let $n = $(_.template('<div data-code="<%- d.code%>" title="<%- d.code%>" class="stock-block"><a class="stock-href" href="#"><%- d.name%> (<%- d.code%>)</a></div>', {d}) );
      
      let ww = 300;
      let hh = 600;
      let left = ww + d.sign * d.level * ww ;
      let top = hh - d.level * hh;
      while( foundConflict(poss, {left, top}) ){
        left += 100;
      }
      poss.push({left, top});
      $n.css({ left, top });
      if( d.sign < 0 ){
        $n.css({
          "border-color":"green",
          "border-width":"5px"
        });
      }else{
        $n.css({
          "border-color":"red",
          "border-width":"5px"
        });
      }
      let k = Math.floor(255 - 255 * (d.volLevel - minVol) / (maxVol - minVol));
      let c = "rgb("+k+",255,255)";
      console.log(c);
      $n.css("background-color", c);
      $screen.append($n); 
    });
    $screen.append();
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
    $.ajax({
      url: "/memo/"+code,
      success: (data) => {
        console.log(data);
        var d = JSON.parse(data);
        var memos = d.memos;
        var name = d.name;
        $("#memo").empty();
        $("#memo").append( $(_.template('<div><%- name %> (<%- code %>)</div>',{name, code}) ) );
        memos.forEach( (memo) => {
          $("#memo").append(_.template('<div>[<%- memo.author%>] <%- memo.memo %></div>', {memo}));
        });
        var h = _.template('<div data-code="<%- code%>" class="add-memo"> <input type="text" class="myMemo"/><button class="btnAddMemo">添加备注</button> </div>',{code});
        $("#memo").append(
          $(h)
        );
      },
      error: (e) => alert(JSON.stringify(e))
    })
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
