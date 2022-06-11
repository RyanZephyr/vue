import { initMixin } from "./init";
import { stateMixin } from "./state";
import { renderMixin } from "./render";
import { eventsMixin } from "./events";
import { lifecycleMixin } from "./lifecycle";
import { warn } from "../util/index";

// Vue函数应仅作为构造函数使用：new Vue({...})
function Vue(options) {
  if (process.env.NODE_ENV !== "production" && !(this instanceof Vue)) {
    warn("Vue is a constructor and should be called with the `new` keyword");
  }
  // 调用Vue.prototype中的_init方法，初始化Vue实例
  this._init(options);
}

// 向Vue.prototype添加属性方法（挂载实例方法）
initMixin(Vue); // 添加_init(options)方法
stateMixin(Vue); // 添加$data $props属性，$set $delete $watch方法
eventsMixin(Vue); // 添加$on $once $off $emit方法
lifecycleMixin(Vue); // 添加_update $forceUpdate $destroy方法
renderMixin(Vue); // 添加helper方法（_s _c等），$nextTick _render方法

export default Vue;
