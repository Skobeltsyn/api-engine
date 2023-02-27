CALL npm run clean_win
CALL tsc
CALL copy package.json dist
CALL copy  README.md dist
CALL npm publish ./dist  --registry http://151.248.114.248:5000/
