/**
 * Storage内容仓库模块
 *
 * @author Kener (@Kener-林峰, linzhifeng@baidu.com)
 *         errorrik (errorrik@gmail.com)
 */


define(
    function (require) {
        var util = require('./tool/util');
        var _idBase = 0x2311; // 图形数据id自增基础

        /**
         * 唯一标识id生成
         * 
         * @inner
         * @param {string=} idHead 标识前缀
         */
        function newShapeId(idHead) {
            return (idHead || '') + (++_idBase);
        }

        /**
         * 快速判断标志~
         * 
         * @inner
         * @param e.__silent 是否需要hover判断
         * @param e.__needTransform 是否需要进行transform
         * @param e.style.__rect 区域矩阵缓存，修改后清空，重新计算一次
         */
        function mark(e) {
            if (e.hoverable || e.onclick || e.draggable
                || e.onmousemove || e.onmouseover || e.onmouseout
                || e.onmousedown || e.onmouseup
                || e.ondragenter || e.ondragover || e.ondragleave
                || e.ondrop
            ) {
                e.__silent = false;
            }
            else {
                e.__silent = true;
            }

            if (Math.abs(e.rotation[0]) > 0.0001
                || Math.abs(e.position[0]) > 0.0001
                || Math.abs(e.position[1]) > 0.0001
                || Math.abs(e.scale[0] - 1) > 0.0001
                || Math.abs(e.scale[1] - 1) > 0.0001
            ) {
                e.__needTransform = true;
            }
            else {
                e.__needTransform = false;
            }

            e.style = e.style || {};
            e.style.__rect = null;
        }

        /**
         * 内容仓库 (M)
         * 
         * @param {Object} shape 图形库
         */
        function Storage(shape) {
            // 所有常规形状，id索引的map
            this._elements = {};

            // 所有形状的z轴方向排列，提高遍历性能，zElements[0]的形状在zElements[1]形状下方
            this._zElements = [];

            // 高亮层形状，不稳定，动态增删，数组位置也是z轴方向，靠前显示在下方
            this._hoverElements = [];

            // 最大zlevel
            this._maxZlevel = 0; 

            // 有数据改变的zlevel
            this._changedZlevel = {};
        }

        /**
         * 遍历迭代器
         * 
         * @param {Function} fun 迭代回调函数，return true终止迭代
         * @param {Object=} option 迭代参数，缺省为仅降序遍历常规形状
         *     hover : true 是否迭代高亮层数据
         *     normal : 'down' | 'up' | 'free' 是否迭代常规数据，迭代时是否指定及z轴顺序
         */
        Storage.prototype.iterShape = function (fun, option) {
            if (!option) {
                option = {
                    hover: false,
                    normal: 'down'
                };
            }
            if (option.hover) {
                //高亮层数据遍历
                for (var i = 0, l = this._hoverElements.length; i < l; i++) {
                    if (fun(this._hoverElements[i])) {
                        return self;
                    }
                }
            }

            var zlist;
            var len;
            if (typeof option.normal != 'undefined') {
                //z轴遍历: 'down' | 'up' | 'free'
                switch (option.normal) {
                    case 'down':
                        // 降序遍历，高层优先
                        var l = this._zElements.length;
                        while (l--) {
                            zlist = this._zElements[l];
                            if (zlist) {
                                len = zlist.length;
                                while (len--) {
                                    if (fun(zlist[len])) {
                                        return this;
                                    }
                                }
                            }
                        }
                        break;
                    case 'up':
                        //升序遍历，底层优先
                        for (var i = 0, l = this._zElements.length; i < l; i++) {
                            zlist = this._zElements[i];
                            if (zlist) {
                                len = zlist.length;
                                for (var k = 0; k < len; k++) {
                                    if (fun(zlist[k])) {
                                        return this;
                                    }
                                }
                            }
                        }
                        break;
                    // case 'free':
                    default:
                        //无序遍历
                        for (var i in this._elements) {
                            if (fun(this._elements[i])) {
                                return this;
                            }
                        }
                        break;
                }
            }

            return this;
        };

        /**
         * 修改
         * 
         * @param {string} idx 唯一标识
         * @param {Object} params]参数
         * @param {boolean} fast
         */
        Storage.prototype.mod = function (shapeId, params, fast) {
            var e = this._elements[shapeId];
            if (e) {
                this._changedZlevel[e.zlevel] = true;    // 可能修改前后不在一层
                if (params) {
                    if (fast) {
                        util.mergeFast(
                            e,
                            params,
                            true,
                            true
                        );
                    } else {
                        util.merge(
                            e,
                            params,
                            {
                                'overwrite': true,
                                'recursive': true
                            }
                        );
                    }   
                }
                mark(e);
                this._changedZlevel[e.zlevel] = true;    // 可能修改前后不在一层
                this._maxZlevel = Math.max(this._maxZlevel, e.zlevel);
            }

            return this;
        };

        /**
         * 常规形状位置漂移，形状自身定义漂移函数
         * 
         * @param {string} idx 形状唯一标识
         */
        Storage.prototype.drift = function (shapeId, dx, dy) {
            var e = this._elements[shapeId];
            if (!e) {
                return;
            }
            e.__needTransform = true;
            if (!e.ondrift //ondrift
                //有onbrush并且调用执行返回false或undefined则继续
                || (e.ondrift && !e.ondrift(e, dx, dy))
            ) {
                var zrender = require('./zrender');
                if (zrender.catchBrushException) {
                    try {
                        shape.get(e.shape).drift(e, dx, dy);
                    }
                    catch(error) {
                        zrender.log(error, 'drift error of ' + e.shape, e);
                    }
                }
                else {
                    shape.get(e.shape).drift(e, dx, dy);
                }
            }

            this._changedZlevel[e.zlevel] = true;

            return this;
        };

        /**
         * 添加高亮层数据
         * 
         * @param {Object} params 参数
         */
        Storage.prototype.addHover = function (params) {
            if ((params.rotation && Math.abs(params.rotation[0]) > 0.0001)
                || (params.position
                    && (Math.abs(params.position[0]) > 0.0001
                        || Math.abs(params.position[1]) > 0.0001))
                || (params.scale
                    && (Math.abs(params.scale[0] - 1) > 0.0001
                    || Math.abs(params.scale[1] - 1) > 0.0001))
            ) {
                params.__needTransform = true;
            }
            else {
                params.__needTransform = false;
            }

            this._hoverElements.push(params);
            return this;
        };

        /**
         * 删除高亮层数据
         */
        Storage.prototype.delHover = function () {
            this._hoverElements = [];
            return this;
        };

        Storage.prototype.hasHoverShape = function () {
            return this._hoverElements.length > 0;
        };

        /**
         * 添加
         * 
         * @param {Object} params 参数
         */
        Storage.prototype.add = function (params) {
            // 默认&必须的参数
            var e = {
                'shape': 'circle',                      // 形状
                'id': params.id || newShapeId(),   // 唯一标识
                'zlevel': 0,                            // z轴位置
                'draggable': false,                     // draggable可拖拽
                'clickable': false,                     // clickable可点击响应
                'hoverable': true,                      // hoverable可悬浮响应
                'position': [0, 0],
                'rotation' : [0, 0, 0],
                'scale' : [1, 1, 0, 0]
            };
            util.merge(
                e,
                params,
                {
                    'overwrite': true,
                    'recursive': true
                }
            );
            mark(e);
            this._elements[e.id] = e;
            this._zElements[e.zlevel] = this._zElements[e.zlevel] || [];
            this._zElements[e.zlevel].push(e);

            this._maxZlevel = Math.max(this._maxZlevel, e.zlevel);
            this._changedZlevel[e.zlevel] = true;

            return this;
        };

        /**
         * 根据指定的shapeId获取相应的shape属性
         * 
         * @param {string=} idx 唯一标识
         */
        Storage.prototype.get = function (shapeId) {
            return this._elements[shapeId];
        };

        /**
         * 删除，shapeId不指定则全清空
         * 
         * @param {string= | Array} idx 唯一标识
         */
        Storage.prototype.del = function (shapeId) {
            if (typeof shapeId != 'undefined') {
                var delMap = {};
                if (!(shapeId instanceof Array)) {
                    // 单个
                    delMap[shapeId] = true;
                }
                else {
                    // 批量删除
                    if (shapeId.lenth < 1) { // 空数组
                        return;
                    }
                    for (var i = 0, l = shapeId.length; i < l; i++) {
                        delMap[shapeId[i].id] = true;
                    }
                }
                var newList;
                var oldList;
                var zlevel;
                var zChanged = {};
                for (var sId in delMap) {
                    if (this._elements[sId]) {
                        zlevel = _elements[sId].zlevel;
                        this._changedZlevel[zlevel] = true;
                        if (!zChanged[zlevel]) {
                            oldList = this._zElements[zlevel];
                            newList = [];
                            for (var i = 0, l = oldList.length; i < l; i++){
                                if (!delMap[oldList[i].id]) {
                                    newList.push(oldList[i]);
                                }
                            }
                            this._zElements[zlevel] = newList;
                            zChanged[zlevel] = true;
                        }

                        delete this._elements[sId];
                    }
                }
            }
            else{
                // 不指定shapeId清空
                this._elements = {};
                this._zElements = [];
                this._hoverElements = [];
                this._maxZlevel = 0;         //最大zlevel
                this._changedZlevel = {      //有数据改变的zlevel
                    all : true
                };
            }

            return this;
        };

        Storage.prototype.getMaxZlevel = function () {
            return this._maxZlevel;
        };

        Storage.prototype.getChangedZlevel = function () {
            return this._changedZlevel;
        };

        Storage.prototype.clearChangedZlevel = function () {
            this._changedZlevel = {};
            return this;
        };

        Storage.prototype.setChangedZlevle = function (level) {
            this._changedZlevel[level] = true;
            return this;
        };

        /**
         * 释放
         */
        Storage.prototype.dispose = function () {
            this._elements = null;
            this._zElements = null;
            this._hoverElements = null;
        };

        Storage.prototype.newShapeId = newShapeId;

        return Storage;
    }
);
