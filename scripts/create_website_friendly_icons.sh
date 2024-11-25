#!/usr/bin/env bash

# for web favicon
convert original.png -define icon:auto-resize=16,32,48,64 favicon.ico

# for iOS Safari "Add to Home Screen"
# <link rel="apple-touch-icon" href="icon120.png" sizes="120x120">
convert original.png -resize 120x120 icon120.png
