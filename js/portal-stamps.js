/**
 * Estampas do login do portal — mesma interação do app principal (app.js _initStampInteractions).
 * Escopo: apenas #portal-login .stamp-float (isolado, sem carregar app.js).
 */
(function initPortalStampInteractions() {
  function run() {
    var root = document.getElementById('portal-login');
    if (!root) return;
    root.querySelectorAll('.stamp-float').forEach(function (stamp) {
      var isDragging = false;
      var hasMoved = false;
      var startX = 0, startY = 0;
      var offsetX = 0, offsetY = 0;
      var originLeft = 0, originTop = 0;
      var rafId = null;
      var nameVisible = false;

      function capturePos(el) {
        var r = el.getBoundingClientRect();
        var pr = (el.offsetParent || document.documentElement).getBoundingClientRect();
        return { left: r.left - pr.left, top: r.top - pr.top };
      }

      function freezeAt(left, top) {
        stamp.style.transition = 'none';
        stamp.style.animationPlayState = 'paused';
        stamp.style.left = left + 'px';
        stamp.style.top = top + 'px';
        stamp.style.right = 'auto';
        stamp.style.bottom = 'auto';
      }

      function onStart(e) {
        e.preventDefault();
        var pt = e.touches ? e.touches[0] : e;
        startX = pt.clientX;
        startY = pt.clientY;
        hasMoved = false;

        var pos = capturePos(stamp);
        originLeft = pos.left;
        originTop = pos.top;

        freezeAt(originLeft, originTop);

        var rect = stamp.getBoundingClientRect();
        offsetX = pt.clientX - rect.left;
        offsetY = pt.clientY - rect.top;

        isDragging = true;

        document.addEventListener('mousemove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd, { passive: false });
      }

      function onMove(e) {
        if (!isDragging) return;
        e.preventDefault();

        var pt = e.touches ? e.touches[0] : e;
        var dx = pt.clientX - startX;
        var dy = pt.clientY - startY;

        if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
          hasMoved = true;
          stamp.classList.add('dragging');
          stamp.classList.add('name-show');
          stamp.style.zIndex = '200';
        }

        if (!hasMoved) return;

        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(function () {
          var pr = (stamp.offsetParent || document.documentElement).getBoundingClientRect();
          var newL = pt.clientX - pr.left - offsetX;
          var newT = pt.clientY - pr.top - offsetY;
          stamp.style.left = newL + 'px';
          stamp.style.top = newT + 'px';
        });
      }

      function onEnd() {
        if (!isDragging) return;
        isDragging = false;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }

        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);

        if (!hasMoved) {
          nameVisible = !nameVisible;
          stamp.classList.toggle('name-show', nameVisible);
          stamp.style.transition = '';
          stamp.style.animationPlayState = '';
          stamp.style.left = '';
          stamp.style.top = '';
          stamp.style.right = '';
          stamp.style.bottom = '';
          return;
        }

        stamp.classList.remove('dragging');
        stamp.classList.remove('name-show');

        stamp.style.transition = [
          'left .42s cubic-bezier(.34,1.56,.64,1)',
          'top  .42s cubic-bezier(.34,1.56,.64,1)',
          'box-shadow .25s ease'
        ].join(',');
        stamp.style.left = originLeft + 'px';
        stamp.style.top = originTop + 'px';
        stamp.style.right = 'auto';
        stamp.style.bottom = 'auto';

        stamp.addEventListener('transitionend', function restore() {
          stamp.removeEventListener('transitionend', restore);
          stamp.style.transition = '';
          stamp.style.animationPlayState = '';
          stamp.style.zIndex = '';
        });
      }

      stamp.addEventListener('mousedown', onStart);
      stamp.addEventListener('touchstart', onStart, { passive: false });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
