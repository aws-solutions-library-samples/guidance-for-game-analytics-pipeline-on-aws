""" 
Copyright 2021 Amazon.com, Inc. and its affiliates. All Rights Reserved.

Licensed under the Amazon Software License (the "License").
You may not use this file except in compliance with the License.
A copy of the License is located at

  http://aws.amazon.com/asl/

or in the "license" file accompanying this file. This file is distributed
on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
express or implied. See the License for the specific language governing
permissions and limitations under the License.
"""

import os
import subprocess
import sys
import shutil


def exit_on_failure(exit_code, msg):
    if exit_code != 0:
        print(msg)
        exit(exit_code)


npm_cmd = shutil.which("npm")
npx_cmd = shutil.which("npx")

cmd = [npm_cmd, "install"]
proc = subprocess.run(cmd, stderr=subprocess.STDOUT, shell=False)
exit_on_failure(proc.returncode, "Cdk npm install failed")

cmd = [npx_cmd, "cdk", "synth"]
proc = subprocess.run(cmd, stderr=subprocess.STDOUT, shell=False)
exit_on_failure(proc.returncode, "Cdk synth failed")