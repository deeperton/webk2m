#!/bin/bash

docker run --restart always -p 7000:4500 -p 8443:8443 -d toxa/webk2m:latest
