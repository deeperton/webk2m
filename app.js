
const express = require('express');
const cons = require('consolidate');
const util = require('util');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const os = require('os');

const execFile = require('child_process').execFile;

const app = express();

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
  files = files.filter((f) => path.extname(f) === '.mobi');
  res.render('index', {
    folder: FILES_MOBI,
    files: files
  });
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (req.file) {
    const ext = path.extname(req.file.originalname)
    await renameFile(req.file.path, req.file.path + path.extname(req.file.originalname));
    await (new Promise((resolve, reject) => {
      execFile(AMZ_CONVERTOR, [req.file.filename + ext], {
        cwd: FILES_SANDBOX
      }, (err, stdout, stderr) => {
        console.log(stdout, stderr);
        if (err) throw err;
        resolve(stdout);
      });
    }));
    let newFileName = req.file.originalname.replace(path.extname(req.file.originalname), '.mobi');
    await copyFile(req.file.path + '.mobi', FILES_MOBI + '/' + newFileName);
    await unlinkFile(req.file.path + ext);
    await unlinkFile(req.file.path + '.mobi');
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

app.listen(PORT);