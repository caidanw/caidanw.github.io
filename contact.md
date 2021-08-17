---
layout: page
title: /contact
permalink: /contact
---

# Get in touch?

<script type="text/javascript">var submitted=false;</script>
<iframe name="hidden_iframe" id="hidden_iframe" style="display:none;" onload="if(submitted) {window.location='/thank-you';}"></iframe>
<form action="{{ site.gf_url }}" method="POST" accept-charset="UTF-8" target="hidden_iframe" onsubmit="submitted=true">
  <input type="text" id="name" name="{{ site.gf_name }}" placeholder="name:" autocomplete="off" required>
  <input type="email" id="email" name="{{ site.gf_email }}" placeholder="email:" autocomplete="off" required>
  <textarea rows="5" id="message" name="{{ site.gf_message }}" placeholder="message:" autocomplete="off"></textarea>
  <input type="text" id="phone" name="{{ site.gf_gotcha }}" style="display:none"  autocomplete="off">
  <input type="submit" id="submit" value="[ submit ]">
</form>
