const fs = require('fs');
const request = require('request');
const globby = require('globby');

/*
 * Airbrake extract plugin
 * - projectId: string - airbrake project id
 * - projectKey: string - airbrake project key
 * - directories: array[string] - directories to scan for sourcemaps
 * - host: string - website url
 * - logging: boolean - enables logs
 * - removeAfterUpload: boolean - removes files after uploading to airbrake
 */
function AirbrakePlugin(options) {
    this.options = Object.assign({}, options);
}

AirbrakePlugin.prototype.apply = function(compiler) {
    /*
     * Get options values
     */
    const { projectId, projectKey, host, logging, removeAfterUpload } = this.options;

    /*
     * Upload file to sourcemaps
     */
    const uploadFile = (path, file) => {
        return new Promise((resolve, reject) => {
            const filePath = path + '/' + file;

            if (!file.slice(-4) === '\.map') {
                console.log(`- won't upload file: ${filePath}`);

                return reject();
            }

            if (logging) {
                console.log(`- will upload file: ${filePath}`);
            }

            const airbrakeUrl = `https://airbrake.io/api/v4/projects/${projectId}/sourcemaps`;

            const postData = {
                headers: {
                    'Authorization': `Bearer ${projectKey}`,
                    'Content-Type': 'multipart/form-data'
                },
                formData: {
                    file: fs.createReadStream(filePath),
                    name: `${host}/${file}`,
                    buffer: new Buffer([1, 2, 3])
                },
            };

            request.post(airbrakeUrl, postData, (err, httpResponse, body) => {
                if (err) {
                    reject(err);

                    return console.error('Error: upload failed - ', err);
                }

                console.log('--- uploaded file: ', filePath);

                if (logging) {
                    console.log('posted to:', airbrakeUrl);
                    console.log('post data:', postData);
                    console.log('Server responded with:', body);
                }

                if (removeAfterUpload) {
                    fs.unlink(filePath, (err) => {
                        if (err) throw err;
                        console.log(`${filePath} was deleted`);
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        });
    };


    /*
     * Upload sourcemaps after compilation is complete
     */
    compiler.hooks.done.tapPromise('AirbrakePlugin', async () => {
        const { directories } = this.options;
        console.log('Starting Airbrake sourcemaps upload...');

        if (!projectId) {
            console.error('- Airbrake projectId is required');
        }

        if (!projectKey) {
            console.error('- Airbrake projectKey is required');
        }

        if (!host) {
            console.error('- Sourcemaps web host is required');
        }

        if (!directories || !directories.length) {
            console.error('- Sourcemap directories value is required');
        }

        if (!projectId || !projectKey || !host || !directories) {
            console.error('- All config values are required to upload airbrake sourcemaps');
        }

        if (directories && directories.length) {
            return Promise.all( 
                directories.map((dir) => {
                    if (logging) {
                        console.log('- Scanning directory:', dir);
                    }
    
                    if (fs.existsSync(dir)) {
                        const files = await globby('**/*.js.map', { cwd: dir });
    
                        return Promise.all(
                            files.map((file) => uploadFile(dir, file))
                        );
                    } else if (logging) {
                        console.log(`- directory: ${dir} not available`);
                    }
                })
            );
        }
    });
};

module.exports = AirbrakePlugin;
