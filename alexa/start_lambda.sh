#!/bin/bash

cat ./asl-config.json.template | sed "s/\"skillId\": \"\",/\"skillId\": \""${RMP_SKILLID}"\",/g" > asl-config.json

alexa-skill-local -f index.js
