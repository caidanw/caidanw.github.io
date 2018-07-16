#!/usr/bin/env python
# -*- coding: utf-8 -*- #
from __future__ import unicode_literals

# Uncomment following line if you want document-relative URLs when developing
RELATIVE_URLS = True
PATH = 'content'
DEFAULT_PAGINATION = 2

AUTHOR = 'Caidan Williams'
SITENAME = 'Coding Notebook'
SITEURL = 'https://mildmelon.github.io'
TIMEZONE = 'America/Denver'

DEFAULT_LANG = 'English'
DEFAULT_CATEGORY = 'Uncategorized'
THEME = 'pelican-blueidea'

STATIC_PATHS = ['images', 'pages']

# Display pages list on the top menu
DISPLAY_PAGES_ON_MENU = True

# Display categories list on the top menu
DISPLAY_CATEGORIES_ON_MENU = False

# Display categories list as a submenu of the top menu
DISPLAY_CATEGORIES_ON_SUBMENU = True

# Display the category in the article's info
DISPLAY_CATEGORIES_ON_POSTINFO = True

# Display the author in the article's info
DISPLAY_AUTHOR_ON_POSTINFO = True

# Display the search form
DISPLAY_SEARCH_FORM = False

# Blogroll
LINKS = (('GitHub', 'https://github.com/mildmelon'),
         ('GitLab', 'https://gitlab.com/caidanwilliams'),
         ('BitBucket', 'https://bitbucket.org/caidanwilliams'),)

# Social widget
SOCIAL = (('Twitter', 'https://twitter.com/_mildmelon'),
          ('LinkedIn', 'https://www.linkedin.com/in/caidan-williams/'),)
