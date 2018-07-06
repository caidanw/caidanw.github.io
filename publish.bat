git add .
git commit -a -m %1
git push -u origin pelican
pipenv run pelican content -o output -s pelicanconf.py
pipenv run ghp-import output -r origin -b master
git push origin master
git checkout pelican
PAUSE