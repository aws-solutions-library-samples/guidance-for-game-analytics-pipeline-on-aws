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
import argparse


def exit_on_failure(exit_code, msg):
    if exit_code != 0:
        print(msg)
        exit(exit_code)


def change_dir_with_return(dir):
    current_dir = os.getcwd()
    os.chdir(dir)
    return lambda: os.chdir(current_dir)


def build_infrastructure():

    return_dir = change_dir_with_return("./infrastructure")

    cmd = [sys.executable, "build.py"]
    proc = subprocess.run(cmd, stderr=subprocess.STDOUT, shell=False)
    exit_on_failure(proc.returncode, "Infrastructure build failed")

    return_dir()


def build_web_app():

    return_dir = change_dir_with_return("./web-app")
    cmd = [sys.executable, "build.py"]
    proc = subprocess.run(cmd, stderr=subprocess.STDOUT, shell=False)
    exit_on_failure(proc.returncode, "Web app build failed")

    return_dir()


def build_logic():

    return_dir = change_dir_with_return("./business-logic")

    cmd = [sys.executable, "build.py"]
    proc = subprocess.run(cmd, stderr=subprocess.STDOUT, shell=False)
    exit_on_failure(proc.returncode, "Business Logic build failed")

    return_dir()


def main():
    parser = argparse.ArgumentParser(
        description="Builds parts or all of the solution.  If no arguments are passed then all builds are run"
    )
    parser.add_argument("--infrastructure",
                        action="store_true", help="builds infrastructure")
    parser.add_argument("--business_logic",
                        action="store_true", help="builds business logic")
    args = parser.parse_args()

    if len(sys.argv) == 1:
        # build_web_app()
        build_logic()
        build_infrastructure()
        # needs to be last to ensure the dependencies are built before the CDK deployment can build/run
    else:
        if args.business_logic:
            build_logic()
        if args.infrastructure:
            build_infrastructure()


if __name__ == "__main__":
    main()
