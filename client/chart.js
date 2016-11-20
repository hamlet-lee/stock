function kchart(elem, title, dtList, kList, amountList){
    
    // 基于准备好的dom，初始化echarts图表
    var myChart = echarts.init(elem); 
    
    option = {
        title : {
            //text: title
        },
        tooltip : {
            trigger: 'axis',
            formatter: function (params) {
                var res = params[0].seriesName + ' ' + params[0].name;
                res += '<br/>  开盘 : ' + params[0].value[0] + '  最高 : ' + params[0].value[3];
                res += '<br/>  收盘 : ' + params[0].value[1] + '  最低 : ' + params[0].value[2];
                return res;
            }
        },
        legend: {
            data:[title]
        },
        toolbox: {
            show : true,
            feature : {
                //mark : {show: true},
                dataZoom : {show: true},
                //dataView : {show: true, readOnly: false},
                //magicType: {show: true, type: ['line', 'bar']},
                restore : {show: true},
                saveAsImage : {show: true}
            }
        },
        dataZoom : {
            show : true,
            realtime: true,
            start : 40,
            end : 100
        },
        xAxis : [
            {
                type : 'category',
                boundaryGap : true,
                axisTick: {onGap:false},
                splitLine: {show:false},
                data : dtList
            }
        ],
        yAxis : [
            {
                type : 'value',
                scale:true,
                boundaryGap: [0.01, 0.01],
                name: "价格",
                z: 1
            },
            {
                type : 'value',
                scale:true,
                boundaryGap: [0.01, 0.01],
                name: "成交量",
                z: 0
            }
        ],
        series : [
            {
                name: title,
                type: 'k',
                data: kList // 开盘，收盘，最低，最高
            }
            ,
            {
                name: title + "成交量",
                type: 'bar',
                data: amountList,
                yAxisIndex: 1,
                itemStyle: {
                normal: {
                    color: 'gray',
                    label: {
                        //show: true,
                        //position: 'top',
                        //formatter: '{b}\n{c}'
                    }
                }
            }
            }
        ]
    };

    // 为echarts对象加载数据 
    myChart.setOption(option); 
}