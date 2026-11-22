// Adds a "Copy" button to every .code block. The pages still read fine without it.
document.querySelectorAll('.code').forEach(function (block) {
  var pre = block.querySelector('pre');
  if (!pre || !navigator.clipboard) return;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Copy';
  btn.setAttribute('aria-label', 'Copy code');
  btn.addEventListener('click', function () {
    navigator.clipboard.writeText(pre.innerText.replace(/\n$/, '')).then(function () {
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
    });
  });
  block.appendChild(btn);
});
