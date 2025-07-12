/**
 * @file このファイルにはPlayerクラスが含まれています。PlayerクラスはプレイヤーのVRMアバターとVRコントローラーとのインタラクションを管理します。
 */
import * as THREE from 'three';
import { VRMHumanBoneName } from '@pixiv/three-vrm';
import { Avatar } from './Avatar';

export class VRPlayer {
    private _avatar: Avatar;
    private _renderer: THREE.WebGLRenderer;
    private _controllerLeft?: THREE.XRTargetRaySpace;
    private _controllerRight?: THREE.XRTargetRaySpace;
    private _xrHeadset: THREE.Camera;
    private _locomotionOffset = new THREE.Vector3();
    private _playerRotation = new THREE.Quaternion();
    private speed = 2.0; // 移動速度
    private rotationSpeed = Math.PI; // 回転速度 (ラジアン/秒)

    constructor(avatar: Avatar, renderer: THREE.WebGLRenderer) {
        this._avatar = avatar;
        this._renderer = renderer;
        // ヘッドセット
        this._xrHeadset = this._renderer.xr.getCamera();

        // コントローラーを特定
        for (let i = 0; i < 2; i++) {
            const controller = this._renderer.xr.getController(i);
            controller.addEventListener('connected', (event) => {
                if (event.data.handedness === 'left') {
                    this._controllerLeft = controller;
                } else if (event.data.handedness === 'right') {
                    this._controllerRight = controller;
                }
            });
        }
    }

    public update(delta: number) {
        if (!this._avatar.vrm || !this._renderer.xr.isPresenting) {
            return;
        }

        this._handleMovement(delta);
        this._handleRotation(delta);
        this._updateHead();
        this._updateHands();
    }

    // 左手のコントローラーで移動
    private _handleMovement(delta: number) {
        if (!this._controllerLeft) return;

        const session = this._renderer.xr.getSession();
        if (!session || !session.inputSources) return;

        for (const source of session.inputSources) {
            if (source.handedness === 'left' && source.gamepad) {
                const gamepad = source.gamepad;
                const xAxis = gamepad.axes[2];
                const yAxis = gamepad.axes[3];

                if (Math.abs(xAxis) > 0.1 || Math.abs(yAxis) > 0.1) {
                    const headQuaternion = new THREE.Quaternion();
                    this._xrHeadset.getWorldQuaternion(headQuaternion);

                    const moveDirection = new THREE.Vector3(xAxis, 0, yAxis);
                    moveDirection.applyQuaternion(headQuaternion);
                    moveDirection.y = 0; // y軸方向の移動は無視
                    moveDirection.normalize();

                    const moveAmount = moveDirection.multiplyScalar(this.speed * delta);
                    this._locomotionOffset.add(moveAmount);
                }
            }
        }
    }

    // 右手のコントローラーで回転
    private _handleRotation(delta: number) {
        if (!this._controllerRight) return;

        const session = this._renderer.xr.getSession();
        if (!session || !session.inputSources) return;

        for (const source of session.inputSources) {
            if (source.handedness === 'right' && source.gamepad) {
                const gamepad = source.gamepad;
                const xAxis = gamepad.axes[2];

                if (Math.abs(xAxis) > 0.1) {
                    const rotationAmount = -xAxis * this.rotationSpeed * delta;
                    const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationAmount);
                    this._playerRotation.multiply(rotationQuaternion);
                }
            }
        }
    }

    private _updateHead() {
        const vrm = this._avatar.vrm!;
        const headBone = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head);

        if (headBone) {
            const headsetWorldQuaternion = new THREE.Quaternion();
            this._xrHeadset.getWorldQuaternion(headsetWorldQuaternion);

            const headsetWorldPosition = new THREE.Vector3();
            this._xrHeadset.getWorldPosition(headsetWorldPosition);

            // アバターのルートの位置と回転は、スティック操作で決まる
            vrm.scene.position.copy(this._locomotionOffset);
            vrm.scene.quaternion.copy(this._playerRotation);

        }
    }

    private _updateHands() {
        const vrmIK = this._avatar.vrmIK;
        if (!vrmIK) return;

        vrmIK.ikChains.forEach(chain => {
            if (chain.effector.userData.vrmHumanBoneName === VRMHumanBoneName.LeftHand && this._controllerLeft) {
                this._updateHand(chain, this._controllerLeft);
            } else if (chain.effector.userData.vrmHumanBoneName === VRMHumanBoneName.RightHand && this._controllerRight) {
                this._updateHand(chain, this._controllerRight);
            }
        });
    }

    private _updateHand(chain: any, controller: THREE.XRTargetRaySpace) {
        const vrm = this._avatar.vrm!;
        const goalPosition = new THREE.Vector3();
        const goalQuaternion = new THREE.Quaternion();

        controller.getWorldPosition(goalPosition);
        controller.getWorldQuaternion(goalQuaternion);

        vrm.scene.worldToLocal(goalPosition);

        const parentRotation = new THREE.Quaternion();
        vrm.scene.getWorldQuaternion(parentRotation);
        goalQuaternion.premultiply(parentRotation.invert());

        chain.goal.position.copy(goalPosition);
        chain.goal.quaternion.copy(goalQuaternion);
    }
}