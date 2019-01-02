
const express = require('express');
const cons = require('consolidate');
const util = require('util');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const os = require('os');

const execFile = require('child_process').execFile;

var http = require('http');
var https = require('https');
var privateKey  = fs.readFileSync('ssl_cert/client-key.pem', 'utf8');
var certificate = fs.readFileSync('ssl_cert/client-cert.pem', 'utf8');

var credentials = {key: privateKey, cert: certificate, passphrase: '1234'};

const app = express();

var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);

httpServer.listen(4500);
httpsServer.listen(8443);

const PORT = process.argv[2] || 4500;

const tmpDir=os.tmpdir();
const sep = path.sep;

const SANDBOX = fs.mkdtempSync(`${tmpDir}${sep}`);
const FILES_SANDBOX = path.normalize(path.normalize(SANDBOX) + '/books');
const FILES_MOBI = FILES_SANDBOX + '/mobi';

const genExt = os.platform() === 'win32' ? '.exe' : '';

const AMZ_CONVERTOR = path.resolve(path.dirname(module.filename), './exe/kindlegen' + genExt);

// tune multer to destination folder
const upload = multer({ dest: FILES_SANDBOX });

const renameFile = util.promisify(fs.rename);
const copyFile = util.promisify(fs.copyFile);
const unlinkFile = util.promisify(fs.unlink);
const readDir = util.promisify(fs.readdir);
const writeFile = util.promisify(fs.writeFile);

// for the first run -- prepare working folders
fs.mkdir(FILES_SANDBOX, 0o755, (err) => {
  if (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
});
fs.mkdir(FILES_MOBI, 0o755, (err) => {
  if (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
});

// tune Express app
app.engine('html', cons.swig);
app.set('view engine', 'html');
app.set('views', './tmpl');

app.use(express.static(FILES_MOBI, {
  dotfiles: 'ignore',
  etag: false,
  extensions: ['mobi'],
  index: false
}));

// basic routes
app.get('/', async (req, res) => {
  let files = await readDir(FILES_MOBI);
  files = files.filter((f) => ['.mobi', '.err'].indexOf(path.extname(f)) > -1);
  res.render('index', { files: files });
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (req.file) {
    const originalExt = path.extname(req.file.originalname)
    await renameFile(req.file.path, req.file.path + path.extname(req.file.originalname));
    try {
      let results = await (new Promise((resolve, reject) => {
        execFile(AMZ_CONVERTOR, [req.file.filename + originalExt], {
          cwd: FILES_SANDBOX
        }, (err, stdout, stderr) => {
          let result = {
            result: true
          }
          console.log(stdout, stderr);
          if (err) {
            result.result = false;
            result = {...result, stdout: stdout, stderr: stderr};
          }
          resolve(result);
        });
      }));

      let fileName = req.file.path + '.mobi';
      let newFileName = FILES_MOBI + '/' + req.file.originalname.replace(path.extname(req.file.originalname), '.mobi');
      if (results.result === false) {
        if (!fs.existsSync(fileName)) {
          // if there was an error in kindlegen, we have to say something
          // for example into file
          await writeFile(req.file.path + '.mobi.err', results.stdout + '\n\n' + results.stderr);
          fileName += '.err';
          newFileName += '.err';
        }
      }
      await copyFile(fileName, newFileName);
      await unlinkFile(req.file.path + originalExt);
      await unlinkFile(fileName);
    } catch (err) {
      console.log(err);
    }
  }

  res.redirect('/');
});

app.get('/clear', async (req, res) => {
  let files = await readDir(FILES_MOBI);
  files.forEach((file) => {
    unlinkFile(FILES_MOBI + '/' + file);
  })
  res.redirect('/');
});

// app.listen(PORT);