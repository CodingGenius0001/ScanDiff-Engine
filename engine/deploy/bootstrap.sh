#!/bin/bash
# One-time setup of a fresh Ubuntu 24.04 server, run as EC2 user data on first boot.
set -euxo pipefail

apt-get update
apt-get install -y docker.io docker-compose-v2 rsync
systemctl enable --now docker
usermod -aG docker ubuntu

mkdir -p /srv/scandiff
chown ubuntu:ubuntu /srv/scandiff

# Swap, so a diff's peak memory or the image build cannot run the 4 GB server out of memory.
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
